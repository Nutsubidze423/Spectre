import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '../store/canvasStore';
import { useAuthStore } from '../store/authStore';
import { getRoomEngine } from '../room/RoomEngine';
import { apiFetch } from '../api/client';
import { useBillingStore } from '../store/billingStore';
import { wireToElement } from '../lib/wireToElement';
import type { CanvasEngine } from '../canvas/CanvasEngine';
import type { Rect } from '../types';

interface Props {
  region: Rect;
  engineRef: React.RefObject<CanvasEngine | null>;
  onClose: () => void;
}

type Status = 'idle' | 'thinking' | 'drawing' | 'error';

export function AIPromptInput({ region, engineRef, onClose }: Props) {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const viewport = useCanvasStore((s) => s.viewport);
  const { pushSnapshot, addElement, setActiveTool } = useCanvasStore();

  const screenX = region.x * viewport.zoom + viewport.offsetX;
  const screenY = region.y * viewport.zoom + viewport.offsetY;
  const screenW = region.width * viewport.zoom;
  const screenH = region.height * viewport.zoom;
  const posLeft = screenX + screenW / 2;
  const posTop = screenY + screenH + 12;

  useEffect(() => {
    inputRef.current?.focus();
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        abortRef.current?.abort();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const generate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || status === 'thinking' || status === 'drawing') return;

    const engine = engineRef.current;
    if (!engine) return;

    const base64 = engine.captureRegion(region);
    if (!base64) {
      setErrorMsg('Could not capture region');
      setStatus('error');
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus('thinking');
    setErrorMsg('');

    try {
      const res = await apiFetch('/api/ai/draw', {
        method: 'POST',
        signal: ctrl.signal,
        body: JSON.stringify({
          prompt: trimmed,
          canvasImageBase64: base64,
          regionBounds: region,
        }),
      });

      if (ctrl.signal.aborted) return;

      if (res.status === 403) {
        const data = await res.json().catch(() => ({})) as { plan?: string; limit?: number };
        useBillingStore.getState().setLimitHit({ type: 'ai', plan: data.plan ?? 'FREE', limit: data.limit });
        onClose();
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Server error' }));
        throw new Error((err as { error?: string }).error ?? 'Unknown error');
      }

      const body = res.body;
      if (!body) throw new Error('No response body');

      const myUserId = useAuthStore.getState().user?.id ?? 'local';
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let elementCount = 0;
      let snapshotPushed = false;

      setStatus('drawing');

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done || ctrl.signal.aborted) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const parts = sseBuffer.split('\n\n');
        sseBuffer = parts.pop() ?? '';

        for (const chunk of parts) {
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event: done')) break outer;
            if (line.startsWith('event: error')) {
              throw new Error('Stream error from server');
            }
            if (line.startsWith('data: ')) {
              const json = line.slice(6).trim();
              if (!json || json === '{}') continue;
              try {
                const wire = JSON.parse(json) as Record<string, unknown>;
                if (!snapshotPushed) {
                  pushSnapshot();
                  snapshotPushed = true;
                }
                const el = wireToElement(wire, region, myUserId);
                addElement(el);
                getRoomEngine()?.emitElementAdd(el);
                elementCount++;
              } catch {
                // malformed line — skip
              }
            }
          }
        }
      }

      reader.releaseLock();

      if (elementCount === 0) {
        throw new Error('No elements generated');
      }

      setActiveTool('select');
      onClose();
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setErrorMsg(err instanceof Error ? err.message : 'Generation failed');
      setStatus('error');
    }
  };

  const isLoading = status === 'thinking' || status === 'drawing';

  return (
    <motion.div
      className="ai-prompt-wrap"
      style={{ left: posLeft, top: posTop }}
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="ai-region-outline"
        style={{
          left: screenX,
          top: screenY,
          width: screenW,
          height: screenH,
        }}
      />

      <div className="ai-prompt-panel">
        <div className="ai-prompt-header">
          <span className="ai-icon">✦</span>
          <span className="ai-label">Specter AI</span>
          <button className="ai-close-btn" onClick={() => { abortRef.current?.abort(); onClose(); }}>✕</button>
        </div>

        <div className="ai-input-row">
          <input
            ref={inputRef}
            className="ai-text-input"
            placeholder="What should I draw here?"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
            disabled={isLoading}
          />
          <button
            className={`ai-generate-btn${isLoading ? ' loading' : ''}`}
            onClick={generate}
            disabled={!prompt.trim() || isLoading}
          >
            {isLoading ? <span className="ai-spinner" /> : 'Generate'}
          </button>
        </div>

        <AnimatePresence>
          {status === 'error' && (
            <motion.p
              className="ai-error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {errorMsg}
            </motion.p>
          )}
        </AnimatePresence>

        {status === 'thinking' && <p className="ai-thinking-text">Specter is thinking…</p>}
        {status === 'drawing' && <p className="ai-thinking-text">Drawing…</p>}
      </div>
    </motion.div>
  );
}

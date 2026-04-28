import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '../store/canvasStore';
import { getRoomEngine } from '../room/RoomEngine';
import { apiFetch } from '../api/client';
import { useBillingStore } from '../store/billingStore';
import type { CanvasEngine } from '../canvas/CanvasEngine';
import type { CanvasElement, Rect } from '../types';

interface Props {
  region: Rect;
  engineRef: React.RefObject<CanvasEngine | null>;
  onClose: () => void;
}

type Status = 'idle' | 'loading' | 'error';

export function AIPromptInput({ region, engineRef, onClose }: Props) {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const viewport = useCanvasStore((s) => s.viewport);
  const { pushSnapshot, addElement, setActiveTool } = useCanvasStore();

  // Position: horizontally centred on region, just below it
  const screenX = region.x * viewport.zoom + viewport.offsetX;
  const screenY = region.y * viewport.zoom + viewport.offsetY;
  const screenW = region.width * viewport.zoom;
  const screenH = region.height * viewport.zoom;
  const posLeft = screenX + screenW / 2;
  const posTop = screenY + screenH + 12;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const generate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || status === 'loading') return;

    const engine = engineRef.current;
    if (!engine) return;

    const base64 = engine.captureRegion(region);
    if (!base64) {
      setErrorMsg('Could not capture region');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await apiFetch('/api/ai/draw', {
        method: 'POST',
        body: JSON.stringify({
          prompt: trimmed,
          canvasImageBase64: base64,
          regionBounds: region,
        }),
      });

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

      const data = await res.json() as { elements: Partial<CanvasElement>[] };

      if (!Array.isArray(data.elements) || data.elements.length === 0) {
        throw new Error('No elements returned');
      }

      const myUserId = 'local';
      const now = Date.now();

      pushSnapshot();

      const finalElements: CanvasElement[] = data.elements.map((el) => ({
        id: crypto.randomUUID(),
        type: el.type ?? 'rect',
        x: el.x ?? region.x,
        y: el.y ?? region.y,
        width: el.width ?? 100,
        height: el.height ?? 100,
        color: el.color ?? '#e8e8f0',
        strokeWidth: el.strokeWidth ?? 2,
        opacity: el.opacity ?? 1,
        roughSeed: Math.floor(Math.random() * 2 ** 31),
        text: el.text,
        points: el.points,
        createdBy: myUserId,
        createdAt: now,
        version: 0,
      }));

      for (const el of finalElements) {
        addElement(el);
        getRoomEngine()?.emitElementAdd(el);
      }

      setActiveTool('select');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Generation failed');
      setStatus('error');
    }
  };

  return (
    <motion.div
      className="ai-prompt-wrap"
      style={{ left: posLeft, top: posTop }}
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Region outline glow */}
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
          <button className="ai-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="ai-input-row">
          <input
            ref={inputRef}
            className="ai-text-input"
            placeholder="What should I draw here?"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
            disabled={status === 'loading'}
          />
          <button
            className={`ai-generate-btn${status === 'loading' ? ' loading' : ''}`}
            onClick={generate}
            disabled={!prompt.trim() || status === 'loading'}
          >
            {status === 'loading' ? (
              <span className="ai-spinner" />
            ) : (
              'Generate'
            )}
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

        {status === 'loading' && (
          <p className="ai-thinking-text">Specter is thinking…</p>
        )}
      </div>
    </motion.div>
  );
}

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useCanvasStore } from '../store/canvasStore';
import { useAuthStore } from '../store/authStore';
import { wireToElement } from '../lib/wireToElement';
import { getRoomEngine } from '../room/RoomEngine';
import { apiFetch } from '../api/client';
import type { CanvasElement } from '../types';

function buildCanvasDescription(elements: CanvasElement[]): string {
  const lines: string[] = [];
  const textEls = elements.filter((el) => el.type === 'text' && el.text);
  const shapes = elements.filter((el) => el.type === 'rect' || el.type === 'ellipse');
  const arrows = elements.filter((el) => el.type === 'arrow');
  const pens = elements.filter((el) => el.type === 'pen');

  if (textEls.length === 0 && shapes.length === 0) return '(empty canvas)';

  for (const el of textEls) {
    lines.push(`Node "${el.text}" at (${Math.round(el.x)}, ${Math.round(el.y)})`);
  }
  for (const el of shapes) {
    lines.push(
      `${el.type} shape at (${Math.round(el.x)}, ${Math.round(el.y)}) size ${Math.round(el.width)}×${Math.round(el.height)}`
    );
  }
  if (arrows.length > 0) lines.push(`${arrows.length} arrow connection(s)`);
  if (pens.length > 0) lines.push(`${pens.length} freehand stroke(s)`);

  return lines.join('\n');
}

export function ChallengeButton() {
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const addElement = useCanvasStore((s) => s.addElement);
  const addChallengeIds = useCanvasStore((s) => s.addChallengeIds);
  const userId = useAuthStore((s) => s.user?.id ?? 'local');

  async function handleChallenge() {
    if (loading) {
      abortRef.current?.abort();
      setLoading(false);
      return;
    }

    const elements = useCanvasStore.getState().elements;
    const desc = buildCanvasDescription(elements);
    if (desc === '(empty canvas)') return;

    const viewport = useCanvasStore.getState().viewport;
    const canvasCenter = {
      x: (window.innerWidth / 2 - viewport.offsetX) / viewport.zoom,
      y: (window.innerHeight / 2 - viewport.offsetY) / viewport.zoom,
    };
    const canvasViewSize = {
      width: window.innerWidth / viewport.zoom,
      height: window.innerHeight / viewport.zoom,
    };

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);

    try {
      const res = await apiFetch('/api/ai/challenge', {
        method: 'POST',
        signal: ctrl.signal,
        body: JSON.stringify({ canvasDescription: desc, canvasCenter, canvasViewSize }),
      });

      if (!res.ok) {
        setLoading(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      const newIds: string[] = [];

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done || ctrl.signal.aborted) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const parts = sseBuffer.split('\n\n');
        sseBuffer = parts.pop() ?? '';
        for (const chunk of parts) {
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event: done')) break outer;
            if (line.startsWith('data: ')) {
              try {
                const wire = JSON.parse(line.slice(6).trim()) as Record<string, unknown>;
                const el = wireToElement(wire, { x: 0, y: 0, width: 0, height: 0 }, userId);
                addElement(el);
                getRoomEngine()?.emitElementAdd(el);
                newIds.push(el.id);
              } catch {
                // skip malformed
              }
            }
          }
        }
      }

      if (newIds.length > 0) addChallengeIds(newIds);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error('[challenge]', err);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <motion.button
      className={`tool-btn challenge-btn${loading ? ' streaming' : ''}`}
      onClick={() => void handleChallenge()}
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.92 }}
      title={loading ? 'Stop (click to cancel)' : 'Challenge This — find logical gaps'}
    >
      {loading ? <span className="challenge-spinner" /> : '⚡'}
    </motion.button>
  );
}

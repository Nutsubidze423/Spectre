import { useEffect, useRef } from 'react';
import { CanvasEngine } from './CanvasEngine';
import { InputHandler } from './InputHandler';
import { useCanvasStore } from '../store/canvasStore';
import type { CanvasElement, ToolEvent } from '../types';

export function useCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  const elements = useCanvasStore((s) => s.elements);
  const setViewport = useCanvasStore((s) => s.setViewport);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new CanvasEngine(canvas);
    engineRef.current = engine;

    // Keep store viewport in sync so UI can display zoom level
    engine.setViewportChangeCallback((vp) => setViewport(vp));

    const handleToolEvent = (event: ToolEvent) => {
      // Phase 2: route to active tool instance
      // For now, no-op so Phase 1 canvas is interactive (pan/zoom only)
      void event;
    };

    const input = new InputHandler(canvas, {
      engine,
      getActiveTool: () => useCanvasStore.getState().activeTool,
      onToolEvent: handleToolEvent,
    });

    const ro = new ResizeObserver(() => engine.handleResize());
    ro.observe(canvas);

    return () => {
      engine.destroy();
      input.destroy();
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync element list to engine whenever store changes
  useEffect(() => {
    engineRef.current?.setElements(elements);
  }, [elements]);

  return { canvasRef, engineRef };
}

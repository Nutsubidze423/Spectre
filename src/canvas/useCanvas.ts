import { useEffect, useRef } from 'react';
import { CanvasEngine } from './CanvasEngine';
import { InputHandler } from './InputHandler';
import { useCanvasStore } from '../store/canvasStore';
import { PenTool } from '../tools/PenTool';
import { ShapeTool } from '../tools/ShapeTool';
import { TextTool } from '../tools/TextTool';
import { EraserTool } from '../tools/EraserTool';
import { SelectionTool } from '../tools/SelectionTool';
import { AISelectionTool } from '../tools/AISelectionTool';
import type { CanvasElement, ITool, ToolEvent } from '../types';

export function useCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const toolMapRef = useRef<Partial<Record<string, ITool>>>({});

  const elements = useCanvasStore((s) => s.elements);
  const setViewport = useCanvasStore((s) => s.setViewport);

  // ─── Mount: create engine, build tool map, wire keyboard ────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new CanvasEngine(canvas);
    engineRef.current = engine;
    engine.setViewportChangeCallback((vp) => setViewport(vp));

    // Shared tool context — always reads current state via getState()
    const toolCtx = {
      engine,
      getColor: () => useCanvasStore.getState().color,
      getStrokeWidth: () => useCanvasStore.getState().strokeWidth,
      getOpacity: () => useCanvasStore.getState().opacity,
      getUserId: () => 'local', // Phase 3: real userId from auth
      onElementAdd: (el: CanvasElement) => {
        useCanvasStore.getState().addElement(el);
      },
      onElementUpdate: (id: string, changes: Partial<CanvasElement>) => {
        useCanvasStore.getState().updateElement(id, changes);
      },
      onElementDelete: (ids: string[]) => {
        useCanvasStore.getState().deleteElements(ids);
      },
      pushSnapshot: () => useCanvasStore.getState().pushSnapshot(),
    };

    toolMapRef.current = {
      select:    new SelectionTool(toolCtx),
      pen:       new PenTool(toolCtx),
      rect:      new ShapeTool(toolCtx, 'rect'),
      ellipse:   new ShapeTool(toolCtx, 'ellipse'),
      line:      new ShapeTool(toolCtx, 'line'),
      arrow:     new ShapeTool(toolCtx, 'arrow'),
      text:      new TextTool(toolCtx),
      eraser:    new EraserTool(toolCtx),
      'ai-select': new AISelectionTool(toolCtx),
    };

    // Route tool events to active tool
    const handleToolEvent = (event: ToolEvent) => {
      const { activeTool } = useCanvasStore.getState();
      toolMapRef.current[activeTool]?.onEvent(event);
    };

    const input = new InputHandler(canvas, {
      engine,
      getActiveTool: () => useCanvasStore.getState().activeTool,
      onToolEvent: handleToolEvent,
    });

    // ─── Keyboard shortcuts ──────────────────────────────────────────────

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useCanvasStore.getState().undo();
        engine.setSelectedIds([]);
      }
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        useCanvasStore.getState().redo();
        engine.setSelectedIds([]);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selectedIds } = useCanvasStore.getState();
        if (selectedIds.length > 0) {
          e.preventDefault();
          useCanvasStore.getState().pushSnapshot();
          useCanvasStore.getState().deleteElements(selectedIds);
          engine.setSelectedIds([]);
        }
      }
      if (e.key === 'Escape') {
        const { activeTool } = useCanvasStore.getState();
        toolMapRef.current[activeTool]?.cancel();
        useCanvasStore.getState().setSelectedIds([]);
        engine.setSelectedIds([]);
        engine.setSelectionRect(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    const ro = new ResizeObserver(() => engine.handleResize());
    ro.observe(canvas);

    return () => {
      engine.destroy();
      input.destroy();
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync elements to engine on store change
  useEffect(() => {
    engineRef.current?.setElements(elements);
  }, [elements]);

  return { canvasRef, engineRef };
}

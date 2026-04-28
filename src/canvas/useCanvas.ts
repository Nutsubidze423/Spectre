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
import { getRoomEngine } from '../room/RoomEngine';
import { useRoomStore } from '../store/roomStore';
import { useBoardStore } from '../store/boardStore';
import type { CanvasElement, ITool, Tool, ToolEvent } from '../types';

interface ChatPos { sx: number; sy: number; cx: number; cy: number; }

interface UseCanvasOptions {
  onReaction?: (emoji: string, x: number, y: number) => void;
  onChatActivate?: (pos: ChatPos | null) => void;
  isChatActive?: () => boolean;
}

export function useCanvas(options: UseCanvasOptions = {}) {
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

    const toolCtx = {
      engine,
      getColor: () => useCanvasStore.getState().color,
      getStrokeWidth: () => useCanvasStore.getState().strokeWidth,
      getOpacity: () => useCanvasStore.getState().opacity,
      getUserId: () => useRoomStore.getState().myUserId ?? 'local',
      onElementAdd: (el: CanvasElement) => {
        useCanvasStore.getState().addElement(el);
        getRoomEngine()?.emitElementAdd(el);
      },
      onElementUpdate: (id: string, changes: Partial<CanvasElement>) => {
        useCanvasStore.getState().updateElement(id, changes);
        getRoomEngine()?.emitElementUpdate(id, changes);
      },
      onElementDelete: (ids: string[]) => {
        useCanvasStore.getState().deleteElements(ids);
        getRoomEngine()?.emitElementDelete(ids);
      },
      pushSnapshot: () => useCanvasStore.getState().pushSnapshot(),
      onStrokePoint: (elementId: string, point: { x: number; y: number }) => {
        getRoomEngine()?.emitStrokePoint(elementId, point.x, point.y);
      },
      onStrokeComplete: (el: CanvasElement) => {
        useCanvasStore.getState().addElement(el);
        getRoomEngine()?.emitStrokeComplete(el);
      },
      onAiRegion: (rect) => {
        useCanvasStore.getState().setAiRegion(rect);
      },
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

    const handleToolEvent = (event: ToolEvent) => {
      const { activeTool } = useCanvasStore.getState();
      toolMapRef.current[activeTool]?.onEvent(event);
    };

    const input = new InputHandler(canvas, {
      engine,
      getActiveTool: () => useCanvasStore.getState().activeTool,
      onToolEvent: handleToolEvent,
      onCursorMove: (x, y) => getRoomEngine()?.emitCursorMove(x, y),
      onReaction: options.onReaction,
      onChatActivate: options.onChatActivate,
      isChatActive: options.isChatActive,
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
          const ids = selectedIds;
          useCanvasStore.getState().deleteElements(ids);
          getRoomEngine()?.emitElementDelete(ids);
          engine.setSelectedIds([]);
        }
      }
      if (e.key === 'Escape') {
        const { activeTool } = useCanvasStore.getState();
        toolMapRef.current[activeTool]?.cancel();
        useCanvasStore.getState().setSelectedIds([]);
        engine.setSelectedIds([]);
        engine.setSelectionRect(null);
        useCanvasStore.getState().setShortcutsOpen(false);
      }

      // ─── Tool shortcuts ────────────────────────────────────────────────────
      const TOOL_KEYS: Partial<Record<string, Tool>> = {
        v: 'select', p: 'pen', r: 'rect', e: 'ellipse',
        l: 'line',   a: 'arrow', t: 'text', x: 'eraser',
      };
      const keyLower = e.key.toLowerCase();
      if (!ctrl && !e.shiftKey && keyLower in TOOL_KEYS) {
        const { activeTool } = useCanvasStore.getState();
        toolMapRef.current[activeTool]?.cancel();
        useCanvasStore.getState().setActiveTool(TOOL_KEYS[keyLower]!);
      }

      // ─── Stroke width [/] ─────────────────────────────────────────────────
      if (!ctrl && e.key === '[') {
        const w = useCanvasStore.getState().strokeWidth;
        useCanvasStore.getState().setStrokeWidth(Math.max(1, w - 1));
      }
      if (!ctrl && e.key === ']') {
        const w = useCanvasStore.getState().strokeWidth;
        useCanvasStore.getState().setStrokeWidth(Math.min(20, w + 1));
      }

      // ─── Reset zoom ───────────────────────────────────────────────────────
      if (!ctrl && e.key === '0') {
        e.preventDefault();
        engine.resetViewport();
      }

      // ─── Fit to content ───────────────────────────────────────────────────
      if (!ctrl && keyLower === 'f') {
        engine.fitToContent(useCanvasStore.getState().elements, 40);
      }

      // ─── Cmd+S — save board ───────────────────────────────────────────────
      if (ctrl && e.key === 's') {
        e.preventDefault();
        const { activeBoardId } = useBoardStore.getState();
        if (activeBoardId) {
          void useBoardStore.getState().saveBoard(activeBoardId, useCanvasStore.getState().elements);
        }
      }

      // ─── Cmd+A — select all ───────────────────────────────────────────────
      if (ctrl && e.key === 'a') {
        e.preventDefault();
        const ids = useCanvasStore.getState().elements.map((el) => el.id);
        useCanvasStore.getState().setActiveTool('select');
        useCanvasStore.getState().setSelectedIds(ids);
        engine.setSelectedIds(ids);
      }

      // ─── Cmd+D — duplicate selected ───────────────────────────────────────
      if (ctrl && e.key === 'd') {
        e.preventDefault();
        const { selectedIds, elements } = useCanvasStore.getState();
        const selected = elements.filter((el) => selectedIds.includes(el.id));
        if (selected.length === 0) return;
        useCanvasStore.getState().pushSnapshot();
        const now = Date.now();
        const copies: CanvasElement[] = selected.map((el) => ({
          ...el,
          id: crypto.randomUUID(),
          x: el.x + 20,
          y: el.y + 20,
          points: el.points?.map((pt) => ({ x: pt.x + 20, y: pt.y + 20 })),
          createdAt: now,
          version: 0,
        }));
        for (const el of copies) {
          useCanvasStore.getState().addElement(el);
          getRoomEngine()?.emitElementAdd(el);
        }
        const newIds = copies.map((el) => el.id);
        useCanvasStore.getState().setSelectedIds(newIds);
        engine.setSelectedIds(newIds);
      }

      // ─── ? — toggle shortcuts panel ───────────────────────────────────────
      if (e.key === '?') {
        const { shortcutsOpen } = useCanvasStore.getState();
        useCanvasStore.getState().setShortcutsOpen(!shortcutsOpen);
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

  useEffect(() => {
    engineRef.current?.setElements(elements);
  }, [elements]);

  return { canvasRef, engineRef };
}

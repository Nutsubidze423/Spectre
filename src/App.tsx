import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useCanvas } from './canvas/useCanvas';
import { useRoom } from './room/useRoom';
import { OverlayEngine } from './canvas/OverlayEngine';
import { Toolbar } from './components/Toolbar';
import { RoomPanel } from './components/RoomPanel';
import { AIPromptInput } from './components/AIPromptInput';
import { AuthModal } from './components/AuthModal';
import { BoardManager } from './components/BoardManager';
import { useCanvasStore } from './store/canvasStore';
import { useAuthStore } from './store/authStore';
import { useBoardStore } from './store/boardStore';
import type { Board } from './types';
import './index.css';

const AUTO_SAVE_INTERVAL = 30_000;

function CanvasView() {
  const { canvasRef, engineRef } = useCanvas();
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayEngineRef = useRef<OverlayEngine | null>(null);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const oe = new OverlayEngine(canvas);
    overlayEngineRef.current = oe;
    oe.handleResize(window.innerWidth, window.innerHeight);
    const ro = new ResizeObserver(() => oe.handleResize(window.innerWidth, window.innerHeight));
    ro.observe(canvas);
    return () => { oe.destroy(); ro.disconnect(); overlayEngineRef.current = null; };
  }, []);

  const viewport = useCanvasStore((s) => s.viewport);
  useEffect(() => {
    overlayEngineRef.current?.setViewport(viewport);
  }, [viewport]);

  const { createRoom, joinRoom, leaveRoom } = useRoom(engineRef, overlayEngineRef);

  const aiRegion = useCanvasStore((s) => s.aiRegion);
  const setAiRegion = useCanvasStore((s) => s.setAiRegion);

  // Auto-save every 30s
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const saveBoard = useBoardStore((s) => s.saveBoard);
  useEffect(() => {
    if (!activeBoardId) return;
    const id = setInterval(() => {
      const elements = useCanvasStore.getState().elements;
      void saveBoard(activeBoardId, elements);
    }, AUTO_SAVE_INTERVAL);
    return () => clearInterval(id);
  }, [activeBoardId, saveBoard]);

  // Back to boards button
  const setAppView = useAuthStore((s) => s.setAppView);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="main-canvas" />
      <canvas ref={overlayCanvasRef} className="overlay-canvas" />
      <Toolbar />
      <RoomPanel
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onLeaveRoom={leaveRoom}
      />

      {activeBoardId && (
        <button
          className="back-to-boards"
          onClick={() => setAppView('boards')}
          title="Back to boards"
        >
          ← Boards
        </button>
      )}

      <AnimatePresence>
        {aiRegion && (
          <AIPromptInput
            region={aiRegion}
            engineRef={engineRef}
            onClose={() => setAiRegion(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const appView = useAuthStore((s) => s.appView);
  const tryRestoreSession = useAuthStore((s) => s.tryRestoreSession);
  const setAppView = useAuthStore((s) => s.setAppView);
  const setActiveBoardId = useBoardStore((s) => s.setActiveBoardId);
  const setElements = useCanvasStore((s) => s.setElements);

  useEffect(() => {
    void tryRestoreSession();
  }, [tryRestoreSession]);

  function handleOpenBoard(board: Board) {
    setActiveBoardId(board.id);
    // Load latest snapshot if available (fetched separately if needed)
    setAppView('canvas');
  }

  if (appView === 'loading') {
    return (
      <div className="app-loading">
        <span className="app-loading-icon">◈</span>
      </div>
    );
  }

  if (appView === 'auth') {
    return <AuthModal onSuccess={() => setAppView('boards')} />;
  }

  if (appView === 'boards') {
    return <BoardManager onOpenBoard={handleOpenBoard} />;
  }

  return <CanvasView />;
}

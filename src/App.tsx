import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useCanvas } from './canvas/useCanvas';
import { useRoom } from './room/useRoom';
import { OverlayEngine } from './canvas/OverlayEngine';
import { Toolbar } from './components/Toolbar';
import { RoomPanel } from './components/RoomPanel';
import { AIPromptInput } from './components/AIPromptInput';
import { useCanvasStore } from './store/canvasStore';
import './index.css';

export default function App() {
  const { canvasRef, engineRef } = useCanvas();
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayEngineRef = useRef<OverlayEngine | null>(null);

  // Overlay engine lifecycle
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

  // Keep overlay viewport in sync with main canvas
  const viewport = useCanvasStore((s) => s.viewport);
  useEffect(() => {
    overlayEngineRef.current?.setViewport(viewport);
  }, [viewport]);

  const { createRoom, joinRoom, leaveRoom } = useRoom(engineRef, overlayEngineRef);

  // AI region state
  const aiRegion = useCanvasStore((s) => s.aiRegion);
  const setAiRegion = useCanvasStore((s) => s.setAiRegion);

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

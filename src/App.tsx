import { useEffect, useRef } from 'react';
import { useCanvas } from './canvas/useCanvas';
import { useRoom } from './room/useRoom';
import { OverlayEngine } from './canvas/OverlayEngine';
import { Toolbar } from './components/Toolbar';
import { RoomPanel } from './components/RoomPanel';
import { useCanvasStore } from './store/canvasStore';
import './index.css';

export default function App() {
  const { canvasRef, engineRef } = useCanvas();
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayEngineRef = useRef<OverlayEngine | null>(null);

  // Initialise overlay engine once
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const oe = new OverlayEngine(canvas);
    overlayEngineRef.current = oe;
    // Initial size
    oe.handleResize(window.innerWidth, window.innerHeight);
    const ro = new ResizeObserver(() => oe.handleResize(window.innerWidth, window.innerHeight));
    ro.observe(canvas);
    return () => { oe.destroy(); ro.disconnect(); overlayEngineRef.current = null; };
  }, []);

  // Keep overlay viewport in sync
  const viewport = useCanvasStore((s) => s.viewport);
  useEffect(() => {
    overlayEngineRef.current?.setViewport(viewport);
  }, [viewport]);

  const { createRoom, joinRoom, leaveRoom } = useRoom(engineRef, overlayEngineRef);

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
    </div>
  );
}

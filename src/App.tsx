import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCanvas } from './canvas/useCanvas';
import { useRoom } from './room/useRoom';
import { OverlayEngine } from './canvas/OverlayEngine';
import { Toolbar } from './components/Toolbar';
import { RoomPanel } from './components/RoomPanel';
import { AIPromptInput } from './components/AIPromptInput';
import { AuthModal } from './components/AuthModal';
import { BoardManager } from './components/BoardManager';
import { PricingPage } from './components/PricingPage';
import { AccountPage } from './components/AccountPage';
import { UpgradeModal } from './components/UpgradeModal';
import { UsageIndicator } from './components/UsageIndicator';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { ChatInput } from './components/ChatInput';
import { useCanvasStore } from './store/canvasStore';
import { useAuthStore } from './store/authStore';
import { useBoardStore } from './store/boardStore';
import { useBillingStore } from './store/billingStore';
import { useRoomStore } from './store/roomStore';
import { getRoomEngine } from './room/RoomEngine';
import type { Board } from './types';
import './index.css';

const AUTO_SAVE_INTERVAL = 30_000;

function SaveIndicator() {
  const isSaving = useBoardStore((s) => s.isSaving);
  const lastSavedAt = useBoardStore((s) => s.lastSavedAt);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!lastSavedAt) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [lastSavedAt]);

  if (!activeBoardId) return null;

  return (
    <AnimatePresence>
      {(isSaving || showSaved) && (
        <motion.div
          className="save-indicator"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2 }}
        >
          {isSaving ? (
            <><span className="save-spinner" />Saving…</>
          ) : (
            <><span className="save-check">✓</span>Saved</>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CanvasView() {
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayEngineRef = useRef<OverlayEngine | null>(null);

  // Chat state
  const [chatPos, setChatPos] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const chatActiveRef = useRef(false);
  useEffect(() => { chatActiveRef.current = chatPos !== null; }, [chatPos]);

  const handleChatActivate = useCallback((pos: { sx: number; sy: number; cx: number; cy: number } | null) => {
    setChatPos(pos);
  }, []);

  const { canvasRef, engineRef } = useCanvas({
    onReaction: (emoji, x, y) => {
      const color = useRoomStore.getState().myColor ?? '#7c6af7';
      overlayEngineRef.current?.addReaction(emoji, x, y);
      getRoomEngine()?.emitReaction(emoji, x, y);
      void color;
    },
    onChatActivate: handleChatActivate,
    isChatActive: () => chatActiveRef.current,
  });

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

  const setAppView = useAuthStore((s) => s.setAppView);
  const setThumbnail = useBoardStore((s) => s.setThumbnail);

  function handleBackToBoards() {
    // Capture thumbnail before leaving
    if (activeBoardId && engineRef.current) {
      const thumb = engineRef.current.captureFullCanvas();
      if (thumb) setThumbnail(activeBoardId, thumb);
    }
    setAppView('boards');
  }

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
      <UsageIndicator />

      {activeBoardId && (
        <button
          className="back-to-boards"
          onClick={handleBackToBoards}
          title="Back to boards"
        >
          ← Boards
        </button>
      )}

      <SaveIndicator />
      <ShortcutsPanel />

      {chatPos && (
        <ChatInput
          screenX={chatPos.sx}
          screenY={chatPos.sy}
          onSend={(text) => {
            const color = useRoomStore.getState().myColor ?? '#7c6af7';
            overlayEngineRef.current?.addChatMessage('local', text, chatPos.cx, chatPos.cy, color);
            getRoomEngine()?.emitChatMessage(text, chatPos.cx, chatPos.cy);
            setChatPos(null);
          }}
          onCancel={() => setChatPos(null)}
        />
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
  const fetchSubscription = useBillingStore((s) => s.fetchSubscription);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    void tryRestoreSession();
  }, [tryRestoreSession]);

  // Fetch billing info whenever a user session is established
  useEffect(() => {
    if (user) void fetchSubscription();
  }, [user, fetchSubscription]);

  function handleOpenBoard(board: Board) {
    setActiveBoardId(board.id);
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
    return <AuthModal onSuccess={() => { setAppView('boards'); void fetchSubscription(); }} />;
  }

  if (appView === 'pricing') {
    return <PricingPage />;
  }

  if (appView === 'account') {
    return <AccountPage />;
  }

  return (
    <>
      {appView === 'boards' && <BoardManager onOpenBoard={handleOpenBoard} />}
      {appView === 'canvas' && <CanvasView />}
      <UpgradeModal />
    </>
  );
}

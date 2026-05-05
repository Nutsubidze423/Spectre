import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '../store/canvasStore';
import { ChallengeButton } from './ChallengeButton';
import type { Tool } from '../types';

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: 'select',    icon: '↖',  label: 'Select (V)' },
  { id: 'pen',       icon: '✏',  label: 'Pen (P)' },
  { id: 'rect',      icon: '▭',  label: 'Rectangle (R)' },
  { id: 'ellipse',   icon: '○',  label: 'Ellipse (E)' },
  { id: 'line',      icon: '╱',  label: 'Line (L)' },
  { id: 'arrow',     icon: '→',  label: 'Arrow (A)' },
  { id: 'text',      icon: 'T',  label: 'Text (T)' },
  { id: 'eraser',    icon: '⌫',  label: 'Eraser (X)' },
  { id: 'ai-select', icon: '✦',  label: 'AI Draw (I)' },
];

const PRESET_COLORS = [
  '#e8e8f0', '#7c6af7', '#f76a6a', '#6af7c8',
  '#f7d76a', '#6ab8f7', '#f76ad7', '#ffffff',
];

const STROKE_STEPS = [1, 2, 4, 6, 10, 16, 20];
const AI_DIVIDER_BEFORE: Tool = 'ai-select';

export function Toolbar() {
  const activeTool   = useCanvasStore((s) => s.activeTool);
  const color        = useCanvasStore((s) => s.color);
  const strokeWidth  = useCanvasStore((s) => s.strokeWidth);
  const viewport     = useCanvasStore((s) => s.viewport);
  const setTool      = useCanvasStore((s) => s.setActiveTool);
  const setColor     = useCanvasStore((s) => s.setColor);
  const setStroke    = useCanvasStore((s) => s.setStrokeWidth);
  const undo            = useCanvasStore((s) => s.undo);
  const redo            = useCanvasStore((s) => s.redo);
  const setShortcutsOpen = useCanvasStore((s) => s.setShortcutsOpen);
  const thinkingPartnerOpen = useCanvasStore((s) => s.thinkingPartnerOpen);
  const setThinkingPartnerOpen = useCanvasStore((s) => s.setThinkingPartnerOpen);
  const memoryPanelOpen = useCanvasStore((s) => s.memoryPanelOpen);
  const setMemoryPanelOpen = useCanvasStore((s) => s.setMemoryPanelOpen);
  const replayMode = useCanvasStore((s) => s.replayMode);
  const setReplayMode = useCanvasStore((s) => s.setReplayMode);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customHex, setCustomHex] = useState('');

  const applyCustomHex = () => {
    const v = customHex.startsWith('#') ? customHex : `#${customHex}`;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) { setColor(v); setShowColorPicker(false); }
  };

  const nextStroke = () => {
    const idx = STROKE_STEPS.findIndex((s) => s >= strokeWidth);
    setStroke(STROKE_STEPS[Math.min(idx + 1, STROKE_STEPS.length - 1)]);
  };
  const prevStroke = () => {
    const idx = STROKE_STEPS.findIndex((s) => s >= strokeWidth);
    setStroke(STROKE_STEPS[Math.max(idx - 1, 0)]);
  };

  return (
    <>
      {/* ── Main toolbar pill ── */}
      <motion.div
        className="toolbar-pill"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Tool buttons */}
        {TOOLS.map((tool) => (
          <div key={tool.id} className="tool-slot">
            {tool.id === AI_DIVIDER_BEFORE && <div className="toolbar-divider" />}
            <motion.button
              className={`tool-btn${activeTool === tool.id ? ' active' : ''}`}
              onClick={() => setTool(tool.id)}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.92 }}
              title={tool.label}
              aria-pressed={activeTool === tool.id}
            >
              {tool.icon}
              {activeTool === tool.id && (
                <motion.div
                  className="tool-active-bg"
                  layoutId="active-tool"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
            </motion.button>
          </div>
        ))}

        {/* ── Color + stroke controls ── */}
        <div className="toolbar-divider" />

        {/* Color swatch trigger */}
        <div className="tool-slot" style={{ position: 'relative' }}>
          <motion.button
            className="color-trigger"
            style={{ background: color }}
            onClick={() => setShowColorPicker((v) => !v)}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            title="Color"
          />
          <AnimatePresence>
            {showColorPicker && (
              <motion.div
                className="color-flyout"
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.18 }}
              >
                <div className="color-swatches">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch${color === c ? ' active' : ''}`}
                      style={{ background: c }}
                      onClick={() => { setColor(c); setShowColorPicker(false); }}
                    />
                  ))}
                </div>
                <div className="hex-row">
                  <input
                    className="hex-input"
                    placeholder="#e8e8f0"
                    value={customHex}
                    onChange={(e) => setCustomHex(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyCustomHex()}
                    maxLength={7}
                  />
                  <button className="hex-apply" onClick={applyCustomHex}>OK</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Stroke width stepper */}
        <div className="stroke-stepper" title="Stroke width">
          <button className="stroke-step-btn" onClick={prevStroke}>−</button>
          <span className="stroke-value">{strokeWidth}</span>
          <button className="stroke-step-btn" onClick={nextStroke}>+</button>
        </div>

        <div className="toolbar-divider" />

        {/* Undo / Redo */}
        <motion.button
          className="tool-btn"
          onClick={undo}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.92 }}
          title="Undo (Ctrl+Z)"
        >↩</motion.button>
        <motion.button
          className="tool-btn"
          onClick={redo}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.92 }}
          title="Redo (Ctrl+Y)"
        >↪</motion.button>

        <div className="toolbar-divider" />

        <motion.button
          className="tool-btn"
          onClick={() => setShortcutsOpen(true)}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.92 }}
          title="Keyboard shortcuts (?)"
        >?</motion.button>

        <div className="toolbar-divider" />

        <motion.button
          className={`tool-btn${thinkingPartnerOpen ? ' active' : ''}`}
          onClick={() => setThinkingPartnerOpen(!thinkingPartnerOpen)}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.92 }}
          title="Thinking Partner (M)"
        >
          ◎
          {thinkingPartnerOpen && (
            <motion.div
              className="tool-active-bg"
              layoutId="active-tool"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
        </motion.button>

        <div className="toolbar-divider" />

        <ChallengeButton />

        <div className="toolbar-divider" />

        <motion.button
          className={`tool-btn${memoryPanelOpen ? ' active' : ''}`}
          onClick={() => setMemoryPanelOpen(!memoryPanelOpen)}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.92 }}
          title="Session Memory"
        >
          🧠
        </motion.button>

        <motion.button
          className={`tool-btn${replayMode ? ' active' : ''}`}
          onClick={() => { if (!replayMode) setReplayMode(true); }}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.92 }}
          title="Replay canvas drawing"
          disabled={replayMode}
        >
          ▶
        </motion.button>
      </motion.div>

      {/* ── Zoom badge ── */}
      <motion.div
        className="zoom-badge"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        {Math.round(viewport.zoom * 100)}%
      </motion.div>
    </>
  );
}

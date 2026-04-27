import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '../store/canvasStore';
import type { Tool } from '../types';

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: 'select',   icon: '↖',  label: 'Select (V)' },
  { id: 'pen',      icon: '✏',  label: 'Pen (P)' },
  { id: 'rect',     icon: '▭',  label: 'Rectangle (R)' },
  { id: 'ellipse',  icon: '○',  label: 'Ellipse (O)' },
  { id: 'line',     icon: '╱',  label: 'Line (L)' },
  { id: 'arrow',    icon: '→',  label: 'Arrow (A)' },
  { id: 'text',     icon: 'T',  label: 'Text (T)' },
  { id: 'eraser',   icon: '⌫',  label: 'Eraser (E)' },
  { id: 'ai-select', icon: '✦', label: 'AI Draw (I)' },
];

const DIVIDER_BEFORE: Tool[] = ['ai-select'];

export function Toolbar() {
  const activeTool = useCanvasStore((s) => s.activeTool);
  const setActiveTool = useCanvasStore((s) => s.setActiveTool);
  const viewport = useCanvasStore((s) => s.viewport);

  return (
    <>
      {/* Main tool pill */}
      <motion.div
        className="toolbar-pill"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {TOOLS.map((tool) => (
          <div key={tool.id} className="tool-slot">
            {DIVIDER_BEFORE.includes(tool.id) && <div className="toolbar-divider" />}
            <motion.button
              className={`tool-btn${activeTool === tool.id ? ' active' : ''}`}
              onClick={() => setActiveTool(tool.id)}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.92 }}
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={activeTool === tool.id}
            >
              {tool.icon}
              {activeTool === tool.id && (
                <motion.div
                  className="tool-active-bg"
                  layoutId="active-tool"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </motion.button>
          </div>
        ))}
      </motion.div>

      {/* Zoom indicator — top right */}
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

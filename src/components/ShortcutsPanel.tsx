import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '../store/canvasStore';

const isMac = /Mac|iPhone|iPad/i.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

interface ShortcutRow {
  keys: string[];
  desc: string;
}

const TOOL_SHORTCUTS: ShortcutRow[] = [
  { keys: ['V'], desc: 'Select' },
  { keys: ['P'], desc: 'Pen' },
  { keys: ['R'], desc: 'Rectangle' },
  { keys: ['E'], desc: 'Ellipse' },
  { keys: ['L'], desc: 'Line' },
  { keys: ['A'], desc: 'Arrow' },
  { keys: ['T'], desc: 'Text' },
  { keys: ['X'], desc: 'Eraser' },
];

const ACTION_SHORTCUTS: ShortcutRow[] = [
  { keys: [mod, 'Z'],         desc: 'Undo' },
  { keys: [mod, '⇧', 'Z'],   desc: 'Redo' },
  { keys: [mod, 'S'],         desc: 'Save board' },
  { keys: [mod, 'A'],         desc: 'Select all' },
  { keys: [mod, 'D'],         desc: 'Duplicate' },
  { keys: ['Del'],            desc: 'Delete selected' },
  { keys: ['Esc'],            desc: 'Deselect / cancel' },
  { keys: ['Space', 'drag'],  desc: 'Pan canvas' },
  { keys: ['['],              desc: 'Decrease stroke' },
  { keys: [']'],              desc: 'Increase stroke' },
  { keys: ['0'],              desc: 'Reset zoom' },
  { keys: ['F'],              desc: 'Fit to content' },
  { keys: ['?'],              desc: 'This panel' },
];

function Row({ keys, desc }: ShortcutRow) {
  return (
    <div className="sc-row">
      <div className="sc-keys">
        {keys.map((k, i) => (
          <span key={i} className={k === 'drag' || k === '+' ? 'sc-plain' : 'sc-key'}>
            {k}
          </span>
        ))}
      </div>
      <span className="sc-desc">{desc}</span>
    </div>
  );
}

export function ShortcutsPanel() {
  const open = useCanvasStore((s) => s.shortcutsOpen);
  const setOpen = useCanvasStore((s) => s.setShortcutsOpen);

  // Close on click-outside is handled by the overlay div
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' || e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sc-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="sc-panel"
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sc-header">
              <span className="sc-title">Keyboard Shortcuts</span>
              <button className="sc-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="sc-body">
              <div className="sc-col">
                <div className="sc-col-label">Tools</div>
                {TOOL_SHORTCUTS.map((s) => <Row key={s.desc} {...s} />)}
              </div>
              <div className="sc-col">
                <div className="sc-col-label">Actions</div>
                {ACTION_SHORTCUTS.map((s) => <Row key={s.desc} {...s} />)}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

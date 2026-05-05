import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '../store/canvasStore';
import type { CanvasElement } from '../types';

const SPEEDS = [0.5, 1, 2, 4] as const;
const BASE_DELAY_MS = 280;

export function ReplayControls() {
  const replayMode = useCanvasStore((s) => s.replayMode);
  const setReplayMode = useCanvasStore((s) => s.setReplayMode);
  const setElements = useCanvasStore((s) => s.setElements);

  const savedRef = useRef<CanvasElement[]>([]);
  const indexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [progress, setProgress] = useState(0);
  const total = savedRef.current.length;

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setElements(savedRef.current);
    setReplayMode(false);
    setPlaying(false);
    setProgress(0);
    indexRef.current = 0;
  }, [setElements, setReplayMode]);

  // Capture elements and clear canvas on enter
  useEffect(() => {
    if (!replayMode) return;
    savedRef.current = useCanvasStore.getState().elements;
    indexRef.current = 0;
    setProgress(0);
    setPlaying(false);
    setElements([]);
  }, [replayMode, setElements]);

  // Cleanup on unmount
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const tick = useCallback(() => {
    const saved = savedRef.current;
    if (indexRef.current >= saved.length) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setPlaying(false);
      return;
    }
    const next = indexRef.current;
    useCanvasStore.setState((s) => ({ elements: [...s.elements, saved[next]] }));
    indexRef.current = next + 1;
    setProgress(next + 1);
  }, []);

  const play = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, BASE_DELAY_MS / speed);
    setPlaying(true);
  }, [tick, speed]);

  const pause = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setPlaying(false);
  }, []);

  // Re-apply speed when it changes while playing
  useEffect(() => {
    if (playing) play();
  }, [speed]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {replayMode && (
        <motion.div
          className="replay-controls"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.22 }}
        >
          <div className="replay-label">Replay</div>

          <div className="replay-progress-bar">
            <div
              className="replay-progress-fill"
              style={{ width: total > 0 ? `${(progress / total) * 100}%` : '0%' }}
            />
          </div>
          <div className="replay-progress-text">{progress} / {total}</div>

          <div className="replay-btns">
            <button
              className="replay-btn"
              onClick={playing ? pause : play}
              title={playing ? 'Pause' : 'Play'}
            >
              {playing ? '⏸' : '▶'}
            </button>

            <button className="replay-btn" onClick={stop} title="Stop & restore">■</button>

            <div className="replay-speeds">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`replay-speed-btn${speed === s ? ' active' : ''}`}
                  onClick={() => setSpeed(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

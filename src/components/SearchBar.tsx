import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useCanvasStore } from '../store/canvasStore';
import type { CanvasEngine } from '../canvas/CanvasEngine';
import type { CanvasElement } from '../types';

interface Props {
  engineRef: React.RefObject<CanvasEngine | null>;
  onClose: () => void;
}

function getCenter(el: CanvasElement): { cx: number; cy: number } {
  if (el.points && el.points.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of el.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }
  return { cx: el.x + (el.width || 0) / 2, cy: el.y + (el.height || 0) / 2 };
}

export function SearchBar({ engineRef, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [resultIndex, setResultIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const elements = useCanvasStore((s) => s.elements);

  const results = useMemo(() => {
    if (query.length < 1) return [];
    const q = query.toLowerCase();
    return elements.filter((el) => el.text && el.text.toLowerCase().includes(q));
  }, [elements, query]);

  // Sync highlights to engine whenever results change
  useEffect(() => {
    engineRef.current?.setHighlightIds(results.map((el) => el.id));
  }, [results, engineRef]);

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function goTo(idx: number, list: CanvasElement[]) {
    if (list.length === 0 || !engineRef.current) return;
    const { cx, cy } = getCenter(list[idx]);
    engineRef.current.smoothPanToCanvas(cx, cy);
  }

  function handleQueryChange(newQuery: string) {
    setQuery(newQuery);
    setResultIndex(0);
    const q = newQuery.toLowerCase();
    const newResults = newQuery.length >= 1
      ? elements.filter((el) => el.text && el.text.toLowerCase().includes(q))
      : [];
    engineRef.current?.setHighlightIds(newResults.map((el) => el.id));
    goTo(0, newResults);
  }

  function navigate(delta: number) {
    if (results.length === 0) return;
    const next = (resultIndex + delta + results.length) % results.length;
    setResultIndex(next);
    goTo(next, results);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      navigate(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigate(-1);
    }
  }

  const showCount = query.length >= 1;
  const displayIndex = results.length > 0 ? resultIndex + 1 : 0;

  return (
    <motion.div
      className="search-bar"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.16 }}
    >
      <svg className="search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5" />
        <line x1="9" y1="9" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      <input
        ref={inputRef}
        className="search-input"
        placeholder="Search text…"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
      />

      {showCount && (
        results.length === 0 ? (
          <span className="search-count search-count--empty">No text found</span>
        ) : (
          <>
            <span className="search-count">{displayIndex} / {results.length}</span>
            {results.length > 1 && (
              <div className="search-nav">
                <button className="search-nav-btn" onClick={() => navigate(-1)} title="Previous (↑)">↑</button>
                <button className="search-nav-btn" onClick={() => navigate(1)} title="Next (↓)">↓</button>
              </div>
            )}
          </>
        )
      )}

      <button className="search-close" onClick={onClose} title="Close (Esc)">✕</button>
    </motion.div>
  );
}

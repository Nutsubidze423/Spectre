import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '../store/canvasStore';
import { useBoardStore } from '../store/boardStore';
import { apiFetch } from '../api/client';

interface Memory {
  id: string;
  boardId: string | null;
  createdAt: string;
  summaryText: string;
  keyTopics: string[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toMarkdown(memories: Memory[]): string {
  return memories
    .map((m) => {
      const topics = m.keyTopics.length ? `\n**Topics:** ${m.keyTopics.join(', ')}` : '';
      return `## ${formatDate(m.createdAt)}\n${m.summaryText}${topics}`;
    })
    .join('\n\n---\n\n');
}

export function MemoryPanel() {
  const open = useCanvasStore((s) => s.memoryPanelOpen);
  const setOpen = useCanvasStore((s) => s.setMemoryPanelOpen);
  const activeBoardId = useBoardStore((s) => s.activeBoardId);

  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch('/api/memory/recent')
      .then((r) => r.json())
      .then((data: { memories: Memory[] }) => {
        const filtered = activeBoardId
          ? data.memories.filter((m) => m.boardId === activeBoardId)
          : data.memories;
        setMemories(filtered);
      })
      .catch(() => setMemories([]))
      .finally(() => setLoading(false));
  }, [open, activeBoardId]);

  function handleCopy() {
    const md = toMarkdown(memories);
    void navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="memory-panel"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="memory-panel-header">
            <span className="memory-panel-title">🧠 Session Memory</span>
            <button className="memory-panel-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          {loading && <div className="memory-panel-empty">Loading…</div>}

          {!loading && memories.length === 0 && (
            <div className="memory-panel-empty">No sessions recorded yet for this board.</div>
          )}

          {!loading && memories.length > 0 && (
            <>
              <div className="memory-panel-list">
                {memories.map((m) => (
                  <div key={m.id} className="memory-panel-item">
                    <div className="memory-item-date">{formatDate(m.createdAt)}</div>
                    <div className="memory-item-summary">{m.summaryText}</div>
                    {m.keyTopics.length > 0 && (
                      <div className="memory-item-topics">
                        {m.keyTopics.map((t) => (
                          <span key={t} className="memory-topic-tag">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button className="memory-copy-btn" onClick={handleCopy}>
                {copied ? '✓ Copied' : 'Copy as Markdown'}
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

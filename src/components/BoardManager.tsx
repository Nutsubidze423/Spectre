import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { useBoardStore } from '../store/boardStore';
import type { Board } from '../types';

interface Props {
  onOpenBoard: (board: Board) => void;
}

function RenameInput({ board, onDone }: { board: Board; onDone: () => void }) {
  const [value, setValue] = useState(board.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameBoardRemote = useBoardStore((s) => s.renameBoardRemote);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function commit() {
    const name = value.trim();
    if (name && name !== board.name) void renameBoardRemote(board.id, name);
    onDone();
  }

  return (
    <input
      ref={inputRef}
      className="bm-rename-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onDone();
      }}
      maxLength={100}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function BoardManager({ onOpenBoard }: Props) {
  const { user, logout } = useAuthStore();
  const { boards, thumbnails, fetchBoards, createBoard, deleteBoard } = useBoardStore();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreateError('');
    const board = await createBoard(name);
    if (!board) {
      setCreateError('Could not create board');
      return;
    }
    setCreating(false);
    setNewName('');
    onOpenBoard(board);
  }

  return (
    <div className="bm-root">
      <header className="bm-header">
        <div className="bm-brand">
          <span className="bm-brand-icon">◈</span>
          <span className="bm-brand-name">Specter</span>
        </div>
        <div className="bm-user">
          <span className="bm-username">@{user?.username}</span>
          <button className="bm-logout" onClick={logout}>Sign out</button>
        </div>
      </header>

      <main className="bm-main">
        <div className="bm-toolbar">
          <h1 className="bm-title">Your boards</h1>
          <button className="bm-create-btn" onClick={() => setCreating(true)}>
            + New board
          </button>
        </div>

        <AnimatePresence>
          {creating && (
            <motion.div
              className="bm-create-form-wrap"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <form className="bm-create-form" onSubmit={handleCreate}>
                <input
                  className="bm-create-input"
                  autoFocus
                  placeholder="Board name…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={100}
                />
                <button className="bm-create-submit" type="submit">Create</button>
                <button
                  className="bm-create-cancel"
                  type="button"
                  onClick={() => { setCreating(false); setNewName(''); setCreateError(''); }}
                >
                  Cancel
                </button>
              </form>
              {createError && <p className="bm-error">{createError}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {boards.length === 0 && !creating && (
          <div className="bm-empty">
            <p className="bm-empty-text">No boards yet.</p>
            <button className="bm-create-btn" onClick={() => setCreating(true)}>
              Create your first board
            </button>
          </div>
        )}

        <div className="bm-grid">
          {boards.map((board) => {
            const thumb = thumbnails[board.id];
            return (
              <motion.div
                key={board.id}
                className="bm-card"
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                whileHover={{ y: -2 }}
              >
                <button className="bm-card-body" onClick={() => onOpenBoard(board)}>
                  <div className="bm-card-preview">
                    {thumb
                      ? <img src={thumb} alt="" className="bm-card-thumb" />
                      : <div className="bm-card-blank"><span>◈</span></div>
                    }
                  </div>
                  <div className="bm-card-info">
                    {renaming === board.id ? (
                      <RenameInput
                        board={board}
                        onDone={() => setRenaming(null)}
                      />
                    ) : (
                      <span
                        className="bm-card-name"
                        onDoubleClick={(e) => { e.stopPropagation(); setRenaming(board.id); }}
                        title="Double-click to rename"
                      >
                        {board.name}
                      </span>
                    )}
                    <span className="bm-card-date">{new Date(board.updatedAt).toLocaleDateString()}</span>
                  </div>
                </button>

                <AnimatePresence>
                  {confirmDelete === board.id ? (
                    <motion.div
                      className="bm-card-confirm"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <span>Delete?</span>
                      <button
                        className="bm-card-confirm-yes"
                        onClick={() => { void deleteBoard(board.id); setConfirmDelete(null); }}
                      >Yes</button>
                      <button className="bm-card-confirm-no" onClick={() => setConfirmDelete(null)}>No</button>
                    </motion.div>
                  ) : (
                    <button
                      className="bm-card-delete"
                      onClick={() => setConfirmDelete(board.id)}
                      title="Delete board"
                    >
                      ✕
                    </button>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

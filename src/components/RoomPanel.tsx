import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoomStore } from '../store/roomStore';

interface RoomPanelProps {
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
}

export function RoomPanel({ onCreateRoom, onJoinRoom, onLeaveRoom }: RoomPanelProps) {
  const room = useRoomStore((s) => s.room);
  const users = useRoomStore((s) => s.users);
  const myColor = useRoomStore((s) => s.myColor);

  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const inRoom = room !== null;

  const copyCode = async () => {
    if (!room) return;
    await navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length >= 4) { onJoinRoom(code); setJoinCode(''); }
  };

  return (
    <div className="room-panel-anchor">
      {/* Toggle button */}
      <motion.button
        className={`room-toggle-btn${inRoom ? ' in-room' : ''}`}
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        title={inRoom ? `Room ${room?.code}` : 'Multiplayer'}
      >
        {inRoom ? (
          <>
            <span className="room-dot" style={{ background: myColor ?? '#7c6af7' }} />
            <span className="room-code-label">{room.code}</span>
            <span className="room-user-count">{users.length}</span>
          </>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        )}
      </motion.button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="room-panel"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {inRoom ? (
              <>
                <div className="room-section">
                  <span className="room-label">Room Code</span>
                  <div className="room-code-row">
                    <span className="room-code-big">{room.code}</span>
                    <button className="room-copy-btn" onClick={copyCode}>
                      {copied ? '✓' : 'Copy'}
                    </button>
                  </div>
                  <p className="room-hint">Share code to invite others</p>
                </div>

                <div className="room-section">
                  <span className="room-label">In Room ({users.length})</span>
                  <div className="room-users-list">
                    {users.map((u) => (
                      <div key={u.id} className="room-user-row">
                        <span className="room-user-dot" style={{ background: u.color }} />
                        <span className="room-user-name">{u.username}</span>
                        {u.color === myColor && (
                          <span className="room-you-badge">you</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  className="room-leave-btn"
                  onClick={() => { onLeaveRoom(); setOpen(false); }}
                >
                  Leave Room
                </button>
              </>
            ) : (
              <>
                <div className="room-section">
                  <span className="room-label">Multiplayer</span>
                  <p className="room-hint">Draw together in real time</p>
                </div>

                <button className="room-create-btn" onClick={onCreateRoom}>
                  Create Room
                </button>

                <div className="room-divider-line" />

                <div className="room-join-row">
                  <input
                    ref={inputRef}
                    className="room-code-input"
                    placeholder="Room code"
                    value={joinCode}
                    maxLength={6}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  />
                  <button
                    className="room-join-btn"
                    onClick={handleJoin}
                    disabled={joinCode.trim().length < 4}
                  >
                    Join
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

interface ChatInputProps {
  screenX: number;
  screenY: number;
  onSend: (text: string) => void;
  onCancel: () => void;
}

const MAX_CHARS = 80;
const WARN_CHARS = 60;

export function ChatInput({ screenX, screenY, onSend, onCancel }: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = text.trim();
      if (trimmed) onSend(trimmed);
      else onCancel();
    } else if (e.key === 'Escape' || e.key === '/') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="chat-input-wrap"
      style={{ left: screenX, top: screenY - 56 }}
    >
      {text.length >= WARN_CHARS && (
        <span className={`chat-char-count${text.length >= MAX_CHARS ? ' chat-char-count--limit' : ''}`}>
          {text.length}/{MAX_CHARS}
        </span>
      )}
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        className="chat-input"
        placeholder="say something…"
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}

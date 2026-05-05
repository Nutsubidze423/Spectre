import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '../store/canvasStore';
import { useAuthStore } from '../store/authStore';
import { useBillingStore } from '../store/billingStore';
import { getRoomEngine } from '../room/RoomEngine';
import { apiFetch } from '../api/client';
import { wireToElement } from '../lib/wireToElement';

type Status = 'idle' | 'thinking' | 'drawing';

const NODE_LEGEND = [
  { color: '#f76a6a', label: 'Problem' },
  { color: '#6ab8f7', label: 'Idea' },
  { color: '#f7d76a', label: 'Question' },
  { color: '#6af7c8', label: 'Decision' },
];

// Widen SpeechRecognition type for browser compat
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionAPI extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function getSpeechRec(): (new () => SpeechRecognitionAPI) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionAPI) | null;
}

export function ThinkingPartnerPanel() {
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [nodeCount, setNodeCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const placedLabelsRef = useRef<Set<string>>(new Set());
  const lastSentRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionAPI | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef('');

  const viewport = useCanvasStore((s) => s.viewport);
  const { addElement, pushSnapshot } = useCanvasStore();
  const setThinkingPartnerOpen = useCanvasStore((s) => s.setThinkingPartnerOpen);

  transcriptRef.current = transcript;

  const getCanvasContext = useCallback(() => {
    const zoom = viewport.zoom;
    return {
      canvasCenter: {
        x: (-viewport.offsetX + window.innerWidth / 2) / zoom,
        y: (-viewport.offsetY + window.innerHeight / 2) / zoom,
      },
      canvasViewSize: {
        width: window.innerWidth / zoom,
        height: window.innerHeight / zoom,
      },
    };
  }, [viewport]);

  const callThinkingPartner = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 12) return;
    if (trimmed === lastSentRef.current) return;
    lastSentRef.current = trimmed;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus('thinking');
    setErrorMsg('');

    try {
      const { canvasCenter, canvasViewSize } = getCanvasContext();
      const existingLabels = [...placedLabelsRef.current];

      const res = await apiFetch('/api/ai/thinking-partner', {
        method: 'POST',
        signal: ctrl.signal,
        body: JSON.stringify({ text: trimmed, canvasCenter, canvasViewSize, existingLabels }),
      });

      if (ctrl.signal.aborted) return;

      if (res.status === 403) {
        const data = await res.json().catch(() => ({})) as { error?: string; feature?: string; title?: string; body?: string; requiredPlan?: 'SOLO' | 'PRO' | 'TEAM' };
        if (data.title && data.body && data.requiredPlan) {
          useBillingStore.getState().setGateHit({ feature: data.feature ?? 'thinking_partner', title: data.title, body: data.body, requiredPlan: data.requiredPlan });
        }
        setStatus('idle');
        return;
      }

      if (!res.ok) {
        setErrorMsg('Server error — try again');
        setStatus('idle');
        return;
      }

      const body = res.body;
      if (!body) { setStatus('idle'); return; }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let snapshotPushed = false;
      const myUserId = useAuthStore.getState().user?.id ?? 'local';

      setStatus('drawing');

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done || ctrl.signal.aborted) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const parts = sseBuffer.split('\n\n');
        sseBuffer = parts.pop() ?? '';

        for (const chunk of parts) {
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event: done')) break outer;
            if (line.startsWith('event: error')) {
              setErrorMsg('Stream error — try again');
              break outer;
            }
            if (line.startsWith('data: ')) {
              const json = line.slice(6).trim();
              if (!json || json === '{}') continue;
              try {
                const wire = JSON.parse(json) as Record<string, unknown>;
                if (!snapshotPushed) { pushSnapshot(); snapshotPushed = true; }
                const el = wireToElement(wire, { x: 0, y: 0, width: 0, height: 0 }, myUserId);
                addElement(el);
                getRoomEngine()?.emitElementAdd(el);
                if (el.type === 'text' && el.text) {
                  placedLabelsRef.current.add(el.text);
                }
                setNodeCount((c) => c + 1);
              } catch {
                // malformed line — skip
              }
            }
          }
        }
      }

      reader.releaseLock();
      setStatus('idle');
    } catch {
      if (abortRef.current?.signal.aborted) return;
      setStatus('idle');
    }
  }, [getCanvasContext, addElement, pushSnapshot]);

  const scheduleCall = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void callThinkingPartner(text), 900);
  }, [callThinkingPartner]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
      setInterimText('');
      return;
    }

    const SpeechRec = getSpeechRec();
    if (!SpeechRec) {
      setErrorMsg('Speech not supported in this browser');
      return;
    }

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalChunk = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalChunk += (event.results[i][0] as SpeechRecognitionAlternative).transcript;
        } else {
          interim += (event.results[i][0] as SpeechRecognitionAlternative).transcript;
        }
      }
      if (finalChunk) {
        setTranscript((prev) => {
          const next = prev + (prev.endsWith(' ') || !prev ? '' : ' ') + finalChunk.trim();
          scheduleCall(next);
          return next;
        });
      }
      setInterimText(interim);
    };

    rec.onerror = () => { setIsListening(false); setInterimText(''); };
    rec.onend = () => { setIsListening(false); setInterimText(''); };

    rec.start();
    recognitionRef.current = rec;
    setIsListening(true);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setTranscript(val);
    scheduleCall(val);
  };

  const handleClose = () => {
    abortRef.current?.abort();
    recognitionRef.current?.stop();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setThinkingPartnerOpen(false);
  };

  const handleClear = () => {
    abortRef.current?.abort();
    recognitionRef.current?.stop();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setTranscript('');
    setInterimText('');
    setStatus('idle');
    setNodeCount(0);
    setErrorMsg('');
    placedLabelsRef.current.clear();
    lastSentRef.current = '';
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      recognitionRef.current?.stop();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasSpeech = !!getSpeechRec();
  const isActive = status !== 'idle';

  return (
    <motion.div
      className="tp-panel"
      initial={{ opacity: 0, x: 20, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div className="tp-header">
        <div className="tp-header-left">
          <span className="tp-icon">◎</span>
          <span className="tp-title">Thinking Partner</span>
        </div>
        <button className="tp-close-btn" onClick={handleClose} title="Close">✕</button>
      </div>

      {/* Status bar */}
      <AnimatePresence mode="wait">
        {status !== 'idle' && (
          <motion.div
            key={status}
            className={`tp-status tp-status--${status}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
          >
            <span className="tp-status-dot" />
            {status === 'thinking' ? 'Thinking…' : 'Drawing…'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic button */}
      {hasSpeech && (
        <div className="tp-mic-row">
          <button
            className={`tp-mic-btn${isListening ? ' tp-mic-btn--active' : ''}`}
            onClick={toggleListening}
            disabled={isActive}
            title={isListening ? 'Stop listening' : 'Start speaking'}
          >
            <span className="tp-mic-icon">{isListening ? '◉' : '○'}</span>
            <span className="tp-mic-label">{isListening ? 'Listening…' : 'Speak'}</span>
          </button>
          {isListening && interimText && (
            <span className="tp-interim">{interimText}</span>
          )}
        </div>
      )}

      {/* Text input */}
      <div className="tp-input-wrap">
        <textarea
          className="tp-textarea"
          placeholder="Type or speak what you're trying to figure out…"
          value={transcript}
          onChange={handleTextChange}
          disabled={isActive}
          rows={4}
        />
      </div>

      {/* Error */}
      <AnimatePresence>
        {errorMsg && (
          <motion.p
            className="tp-error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {errorMsg}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Stats + clear */}
      {nodeCount > 0 && (
        <div className="tp-stats-row">
          <span className="tp-node-count">{nodeCount} element{nodeCount !== 1 ? 's' : ''} drawn</span>
          <button className="tp-clear-btn" onClick={handleClear} title="Clear and start over">
            Clear
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="tp-legend">
        {NODE_LEGEND.map(({ color, label }) => (
          <div key={label} className="tp-legend-item">
            <span className="tp-legend-dot" style={{ background: color }} />
            <span className="tp-legend-label">{label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

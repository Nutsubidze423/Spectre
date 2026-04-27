import { useState, useRef } from 'react';
import { AIAssistant } from './AIAssistant';
import type { Rect } from '../types';

// Phase 4: full implementation with loading state + error handling.
export function useAIAssistant() {
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assistantRef = useRef(new AIAssistant());

  const draw = async (
    _prompt: string,
    _snapshot: string,
    _region: Rect
  ): Promise<void> => {
    setIsThinking(true);
    setError(null);
    try {
      // Phase 4
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsThinking(false);
    }
  };

  return { isThinking, error, draw };
}

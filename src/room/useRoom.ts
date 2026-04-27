import { useRef } from 'react';
import { RoomEngine } from './RoomEngine';

// Phase 3: full implementation wrapping RoomEngine in a React hook.
export function useRoom() {
  const engineRef = useRef<RoomEngine | null>(null);

  const createRoom = async (): Promise<string> => {
    return '';
  };

  const joinRoom = async (_code: string): Promise<void> => {
    // Phase 3
  };

  const leaveRoom = (): void => {
    engineRef.current?.leaveRoom();
  };

  return { createRoom, joinRoom, leaveRoom };
}

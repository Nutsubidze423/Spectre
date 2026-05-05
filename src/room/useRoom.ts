import { useEffect, useRef, useCallback } from 'react';
import { RoomEngine, setRoomEngine } from './RoomEngine';
import { useCanvasStore } from '../store/canvasStore';
import { useRoomStore } from '../store/roomStore';
import { useBillingStore } from '../store/billingStore';
import type { CanvasEngine } from '../canvas/CanvasEngine';
import type { OverlayEngine } from '../canvas/OverlayEngine';
import type { CanvasElement } from '../types';

const SERVER_URL = (import.meta as { env: Record<string, string> }).env.VITE_SERVER_URL ?? 'http://localhost:3001';

export function useRoom(
  engineRef: React.RefObject<CanvasEngine | null>,
  overlayRef: React.RefObject<OverlayEngine | null>
) {
  const reRef = useRef<RoomEngine | null>(null);

  const { setElements } = useCanvasStore();
  const {
    setRoom, setUsers, addUser, removeUser,
    updateUserCursor, setIsConnected, setMyUserId, setMyColor, setRoomFull,
  } = useRoomStore();

  useEffect(() => {
    const re = new RoomEngine(SERVER_URL);
    reRef.current = re;
    setRoomEngine(re);

    re.onConnected(() => setIsConnected(true));
    re.onDisconnected(() => setIsConnected(false));

    re.onRoomCreated(({ roomId, code, myUserId, myColor }) => {
      setRoom({ id: roomId, code, hostId: myUserId });
      setMyUserId(myUserId);
      setMyColor(myColor);
    });

    re.onRoomJoined(({ roomId, code, elements, users, myUserId, myColor }) => {
      setElements(elements as CanvasElement[]);
      setUsers(users);
      setRoom({ id: roomId, code, hostId: '' });
      setMyUserId(myUserId);
      setMyColor(myColor);
    });

    re.onRoomError(({ message }) => {
      console.error('[room error]', message);
    });

    re.onRoomFull((data) => {
      setRoomFull(data);
      useBillingStore.getState().setGateHit({
        feature: 'collaborators',
        title: 'Room is full',
        body: `Your plan allows up to ${data.limit} collaborators per room. Upgrade to add more.`,
        requiredPlan: data.plan === 'FREE' ? 'SOLO' : data.plan === 'SOLO' ? 'PRO' : 'TEAM',
      });
    });

    re.onUserJoined((user) => addUser(user));

    re.onUserLeft(({ userId }) => {
      removeUser(userId);
      engineRef.current?.clearRemoteStroke(userId);
      overlayRef.current?.removeUser(userId);
    });

    re.onCursorMoved(({ userId, x, y }) => {
      updateUserCursor(userId, x, y);
      const user = useRoomStore.getState().users.find((u) => u.id === userId);
      if (user) {
        overlayRef.current?.updateCursor(userId, x, y, user.color, user.username);
      }
    });

    re.onStrokePoint(({ userId, elementId, x, y }) => {
      const user = useRoomStore.getState().users.find((u) => u.id === userId);
      if (!user) return;
      engineRef.current?.setRemoteStrokePoint(elementId, { x, y }, user.color, 2);
    });

    re.onStrokeComplete(({ element }) => {
      engineRef.current?.clearRemoteStroke(element.id);
      useCanvasStore.getState().addElement(element);
    });

    re.onElementAdded(({ element }) => {
      useCanvasStore.getState().addElement(element);
    });

    re.onElementUpdated(({ id, changes }) => {
      useCanvasStore.getState().updateElement(id, changes);
    });

    re.onElementDeleted(({ ids }) => {
      useCanvasStore.getState().deleteElements(ids);
    });

    re.onReactionReceived(({ emoji, x, y }) => {
      overlayRef.current?.addReaction(emoji, x, y);
    });

    re.onChatReceived(({ userId, text, x, y, color }) => {
      overlayRef.current?.addChatMessage(userId, text, x, y, color);
    });

    return () => {
      re.destroy();
      setRoomEngine(null);
      reRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = useCallback(() => {
    reRef.current?.createRoom();
  }, []);

  const joinRoom = useCallback((code: string) => {
    reRef.current?.joinRoom(code);
  }, []);

  const leaveRoom = useCallback(() => {
    reRef.current?.leaveRoom();
    setRoom(null);
    setUsers([]);
    setMyUserId('');
    setMyColor('');
    useCanvasStore.getState().clearCanvas();
    engineRef.current?.clearAllRemoteStrokes();
  }, [engineRef, setMyColor, setMyUserId, setRoom, setUsers]);

  return { createRoom, joinRoom, leaveRoom };
}

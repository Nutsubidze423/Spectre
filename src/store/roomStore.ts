import { create } from 'zustand';
import type { RemoteUser, Room } from '../types';

interface RoomState {
  room: Room | null;
  users: RemoteUser[];
  isConnected: boolean;
  myUserId: string | null;
  myColor: string | null;

  setRoom: (room: Room | null) => void;
  setUsers: (users: RemoteUser[]) => void;
  addUser: (user: RemoteUser) => void;
  removeUser: (userId: string) => void;
  updateUserCursor: (userId: string, x: number, y: number) => void;
  setIsConnected: (connected: boolean) => void;
  setMyUserId: (id: string) => void;
  setMyColor: (color: string) => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  users: [],
  isConnected: false,
  myUserId: null,
  myColor: null,

  setRoom: (room) => set({ room }),
  setUsers: (users) => set({ users }),

  addUser: (user) =>
    set((state) => ({ users: [...state.users.filter((u) => u.id !== user.id), user] })),

  removeUser: (userId) =>
    set((state) => ({ users: state.users.filter((u) => u.id !== userId) })),

  updateUserCursor: (userId, x, y) =>
    set((state) => ({
      users: state.users.map((u) =>
        u.id === userId ? { ...u, cursor: { x, y } } : u
      ),
    })),

  setIsConnected: (connected) => set({ isConnected: connected }),
  setMyUserId: (id) => set({ myUserId: id }),
  setMyColor: (color) => set({ myColor: color }),
}));

"use client";

import { io, type Socket } from "socket.io-client";
import type { Ack, RoomIdentity } from "./types";

let socket: Socket | null = null;

export function getRealtimeSocket() {
  if (!socket) {
    socket = io({
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      timeout: 8_000,
    });
  }
  return socket;
}

export function emitAck<T>(event: string, payload: unknown): Promise<Ack<T>> {
  const activeSocket = getRealtimeSocket();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      resolve({ ok: false, error: { code: "TIMEOUT", message: "The server took too long to respond." } });
    }, 10_000);
    activeSocket.emit(event, payload, (result: Ack<T>) => {
      window.clearTimeout(timeout);
      resolve(result);
    });
  });
}

export function saveRoomIdentity(identity: RoomIdentity) {
  localStorage.setItem(`ludo:room:${identity.roomCode}`, JSON.stringify(identity));
}

export function loadRoomIdentity(code: string): RoomIdentity | null {
  try {
    const raw = localStorage.getItem(`ludo:room:${code}`);
    return raw ? JSON.parse(raw) as RoomIdentity : null;
  } catch {
    return null;
  }
}

export function clearRoomIdentity(code: string) {
  localStorage.removeItem(`ludo:room:${code}`);
}

import type { GameState, PlayerColor } from "../game/types";

export type RoomStatus = "waiting" | "playing" | "finished";

export type RoomPlayer = {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  leftAt: number | null;
  missedTurns: number;
  isHost: boolean;
  joinedAt: number;
};

export type RoomSnapshot = {
  code: string;
  status: RoomStatus;
  players: RoomPlayer[];
  hostPlayerId: string;
  game: GameState | null;
  turnDeadline: number | null;
  version: number;
  createdAt: number;
  updatedAt: number;
};

export type RoomIdentity = {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
};

export type RealtimeError = {
  code: string;
  message: string;
};

export type Ack<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : T))
  | { ok: false; error: RealtimeError };

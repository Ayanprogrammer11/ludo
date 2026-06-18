import type { GameState, PlayerColor } from "../game/types";

export type UserRole = "user" | "admin";

export type SafeUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: number;
};

export type StoredUser = SafeUser & {
  emailNormalized: string;
  passwordHash: string;
  passwordSalt: string;
  passwordUpdatedAt: number;
  failedLoginCount: number;
  lockedUntil: number | null;
  lastLoginAt: number | null;
  updatedAt: number;
};

export type StoredSession = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  userAgentHash: string | null;
  revokedAt: number | null;
};

export type StoredMatchPlayer = {
  userId: string;
  name: string;
  color: PlayerColor;
};

export type StoredMatch = {
  id: string;
  roomCode: string;
  gameId: string;
  startedAt: number;
  finishedAt: number;
  players: StoredMatchPlayer[];
  winnerUserId: string | null;
  replay?: MatchReplay | null;
};

export type AuthData = {
  version: 1;
  users: StoredUser[];
  sessions: StoredSession[];
  matches: StoredMatch[];
};

export type SessionValidation = {
  sessionId: string;
  expiresAt: number;
  user: SafeUser;
};

export type AccountStats = {
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
};

export type RecentMatch = {
  id: string;
  roomCode: string;
  playedAt: number;
  outcome: "won" | "lost";
  winnerName: string | null;
  players: StoredMatchPlayer[];
  hasReplay: boolean;
};

export type AccountDashboard = {
  user: SafeUser;
  stats: AccountStats;
  recentMatches: RecentMatch[];
};

export type FinishedRoomMatch = {
  roomCode: string;
  gameId: string;
  startedAt: number;
  finishedAt: number;
  players: StoredMatchPlayer[];
  winnerUserId: string | null;
  replay: MatchReplay;
};

export type MatchReplayFrame = {
  at: number;
  label: string;
  turnDeadline: number | null;
  state: GameState;
};

export type MatchReplay = {
  turnDurationMs: number;
  activeDisconnectGraceMs: number;
  waitingDisconnectGraceMs: number;
  frames: MatchReplayFrame[];
};

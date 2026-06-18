import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { SESSION_TTL_MS } from "./cookies";
import { hashPassword, verifyPassword } from "./password";
import type {
  AccountDashboard,
  AuthData,
  FinishedRoomMatch,
  RecentMatch,
  SafeUser,
  SessionValidation,
  StoredMatch,
  StoredSession,
  StoredUser,
} from "./types";

const AUTH_STORE_FILE = "auth-store.json";
const MAX_FAILED_LOGINS = 8;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 15 * 60 * 1000;
const MAX_SESSIONS_PER_USER = 12;
const MAX_MATCHES = 25_000;

class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function initialData(): AuthData {
  return { version: 1, users: [], sessions: [], matches: [] };
}

function dataDir() {
  return process.env.AUTH_DATA_DIR || path.join(process.cwd(), ".data");
}

function storePath() {
  return path.join(dataDir(), AUTH_STORE_FILE);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function hashUserAgent(userAgent: string | null | undefined) {
  return userAgent ? createHash("sha256").update(userAgent.slice(0, 512)).digest("base64url") : null;
}

function toSafeUser(user: StoredUser): SafeUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function matchOutcome(match: StoredMatch, userId: string): RecentMatch {
  const winner = match.players.find((player) => player.userId === match.winnerUserId);
  return {
    id: match.id,
    roomCode: match.roomCode,
    playedAt: match.finishedAt,
    outcome: match.winnerUserId === userId ? "won" : "lost",
    winnerName: winner?.name ?? null,
    players: match.players,
    hasReplay: Boolean(match.replay?.frames.length),
  };
}

export class AuthStore {
  private queue = Promise.resolve();

  async registerUser(input: { email: string; displayName: string; password: string }, now = Date.now()) {
    return this.enqueue(async () => {
      const data = await this.read();
      const emailNormalized = normalizeEmail(input.email);
      if (data.users.some((user) => user.emailNormalized === emailNormalized)) {
        throw new AuthError("EMAIL_IN_USE", "An account already exists for that email.");
      }

      const password = await hashPassword(input.password);
      const user: StoredUser = {
        id: randomUUID(),
        email: input.email.trim(),
        emailNormalized,
        displayName: input.displayName.trim(),
        role: "user",
        createdAt: now,
        updatedAt: now,
        passwordHash: password.hash,
        passwordSalt: password.salt,
        passwordUpdatedAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
      };
      data.users.push(user);
      await this.write(data);
      return toSafeUser(user);
    });
  }

  async authenticate(input: { email: string; password: string; userAgent?: string | null }, now = Date.now()) {
    return this.enqueue(async () => {
      const data = await this.read();
      const emailNormalized = normalizeEmail(input.email);
      const user = data.users.find((candidate) => candidate.emailNormalized === emailNormalized);
      const locked = user?.lockedUntil && user.lockedUntil > now;
      const passwordMatches = await verifyPassword(input.password, user?.passwordSalt, user?.passwordHash);

      if (!user || locked || !passwordMatches) {
        if (user && !locked) {
          user.failedLoginCount += 1;
          if (user.failedLoginCount >= MAX_FAILED_LOGINS) user.lockedUntil = now + LOGIN_LOCK_MS;
          user.updatedAt = now;
          await this.write(data);
        }
        throw new AuthError("INVALID_CREDENTIALS", "The email or password was not accepted.");
      }

      user.failedLoginCount = 0;
      user.lockedUntil = null;
      user.lastLoginAt = now;
      user.updatedAt = now;
      const session = this.createSessionRecord(user.id, input.userAgent, now);
      data.sessions = data.sessions
        .filter((candidate) => candidate.userId !== user.id || (!candidate.revokedAt && candidate.expiresAt > now))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_SESSIONS_PER_USER - 1)
        .concat(session.record);
      await this.write(data);
      return { user: toSafeUser(user), token: session.token, expiresAt: session.record.expiresAt };
    });
  }

  async createSession(userId: string, userAgent?: string | null, now = Date.now()) {
    return this.enqueue(async () => {
      const data = await this.read();
      const user = data.users.find((candidate) => candidate.id === userId);
      if (!user) throw new AuthError("USER_NOT_FOUND", "User does not exist.");
      const session = this.createSessionRecord(user.id, userAgent, now);
      data.sessions = data.sessions.filter((candidate) => candidate.expiresAt > now && !candidate.revokedAt);
      data.sessions.push(session.record);
      await this.write(data);
      return { user: toSafeUser(user), token: session.token, expiresAt: session.record.expiresAt };
    });
  }

  async validateSessionToken(token: string | null | undefined, now?: number): Promise<SessionValidation | null> {
    if (!token || token.length < 32 || token.length > 256) return null;
    const checkedAt = now ?? Date.now();
    return this.enqueue(async () => {
      const data = await this.read();
      const session = data.sessions.find((candidate) => candidate.tokenHash === tokenHash(token));
      if (!session || session.revokedAt || session.expiresAt <= checkedAt) return null;
      const user = data.users.find((candidate) => candidate.id === session.userId);
      if (!user) return null;

      if (checkedAt - session.lastSeenAt >= SESSION_TOUCH_INTERVAL_MS) {
        session.lastSeenAt = checkedAt;
        data.sessions = data.sessions.filter((candidate) => candidate.expiresAt > checkedAt && !candidate.revokedAt);
        await this.write(data);
      }

      return {
        sessionId: session.id,
        expiresAt: session.expiresAt,
        user: toSafeUser(user),
      };
    });
  }

  async revokeSessionToken(token: string | null | undefined, now = Date.now()) {
    if (!token) return;
    await this.enqueue(async () => {
      const data = await this.read();
      const session = data.sessions.find((candidate) => candidate.tokenHash === tokenHash(token));
      if (session && !session.revokedAt) {
        session.revokedAt = now;
        await this.write(data);
      }
    });
  }

  async updateProfile(userId: string, input: { displayName: string }, now = Date.now()) {
    return this.enqueue(async () => {
      const data = await this.read();
      const user = data.users.find((candidate) => candidate.id === userId);
      if (!user) throw new AuthError("USER_NOT_FOUND", "User does not exist.");
      user.displayName = input.displayName.trim();
      user.updatedAt = now;
      await this.write(data);
      return toSafeUser(user);
    });
  }

  async recordMatch(match: FinishedRoomMatch) {
    return this.enqueue(async () => {
      const data = await this.read();
      const matchId = `${match.roomCode}:${match.gameId}:${match.startedAt}`;
      if (data.matches.some((candidate) => candidate.id === matchId)) return false;
      data.matches.push({
        id: matchId,
        roomCode: match.roomCode,
        gameId: match.gameId,
        startedAt: match.startedAt,
        finishedAt: match.finishedAt,
        players: match.players,
        winnerUserId: match.winnerUserId,
        replay: match.replay,
      });
      if (data.matches.length > MAX_MATCHES) data.matches = data.matches.slice(-MAX_MATCHES);
      await this.write(data);
      return true;
    });
  }

  async getDashboard(userId: string): Promise<AccountDashboard | null> {
    return this.enqueue(async () => {
      const data = await this.read();
      const user = data.users.find((candidate) => candidate.id === userId);
      if (!user) return null;

      const matches = data.matches
        .filter((match) => match.players.some((player) => player.userId === userId))
        .sort((a, b) => b.finishedAt - a.finishedAt);
      const wins = matches.filter((match) => match.winnerUserId === userId).length;
      const losses = matches.length - wins;
      return {
        user: toSafeUser(user),
        stats: {
          matchesPlayed: matches.length,
          wins,
          losses,
          winRate: matches.length ? Math.round((wins / matches.length) * 100) : 0,
        },
        recentMatches: matches.slice(0, 8).map((match) => matchOutcome(match, userId)),
      };
    });
  }

  async getMatchForUser(userId: string, matchId: string): Promise<StoredMatch | null> {
    return this.enqueue(async () => {
      const data = await this.read();
      const match = data.matches.find((candidate) => candidate.id === matchId);
      if (!match?.players.some((player) => player.userId === userId)) return null;
      return structuredClone(match);
    });
  }

  private createSessionRecord(userId: string, userAgent: string | null | undefined, now: number) {
    const token = randomBytes(32).toString("base64url");
    const record: StoredSession = {
      id: randomUUID(),
      userId,
      tokenHash: tokenHash(token),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      lastSeenAt: now,
      userAgentHash: hashUserAgent(userAgent),
      revokedAt: null,
    };
    return { token, record };
  }

  private enqueue<T>(work: () => Promise<T>) {
    const next = this.queue.then(work, work);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async read(): Promise<AuthData> {
    await mkdir(dataDir(), { recursive: true, mode: 0o700 });
    try {
      const raw = await readFile(storePath(), "utf8");
      const parsed = JSON.parse(raw) as AuthData;
      if (parsed.version !== 1 || !Array.isArray(parsed.users) || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.matches)) {
        throw new Error("Auth store is malformed.");
      }
      return parsed;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        const data = initialData();
        await this.write(data);
        return data;
      }
      throw error;
    }
  }

  private async write(data: AuthData) {
    await mkdir(dataDir(), { recursive: true, mode: 0o700 });
    const tempPath = path.join(dataDir(), `${AUTH_STORE_FILE}.${randomUUID()}.tmp`);
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(tempPath, storePath());
  }
}

export { AuthError };
export const authStore = new AuthStore();

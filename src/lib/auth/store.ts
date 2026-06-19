import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SESSION_TTL_MS } from "./cookies";
import { hashPassword, verifyPassword } from "./password";
import type {
  AccountDashboard,
  AuthData,
  FinishedRoomMatch,
  MatchReplay,
  RecentMatch,
  SafeUser,
  SessionValidation,
  StoredMatch,
  StoredMatchPlayer,
  StoredSession,
  StoredUser,
  UserRole,
} from "./types";

const AUTH_DB_FILE = "auth-store.sqlite";
const LEGACY_AUTH_STORE_FILE = "auth-store.json";
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

function dataDir() {
  return process.env.AUTH_DATA_DIR || path.join(process.cwd(), ".data");
}

function storePath() {
  return path.join(dataDir(), AUTH_DB_FILE);
}

function legacyStorePath() {
  return path.join(dataDir(), LEGACY_AUTH_STORE_FILE);
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

type UserRow = {
  id: string;
  email: string;
  email_normalized: string;
  display_name: string;
  role: UserRole;
  created_at: number;
  updated_at: number;
  password_hash: string;
  password_salt: string;
  password_updated_at: number;
  failed_login_count: number;
  locked_until: number | null;
  last_login_at: number | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
  user_agent_hash: string | null;
  revoked_at: number | null;
};

type MatchRow = {
  id: string;
  room_code: string;
  game_id: string;
  started_at: number;
  finished_at: number;
  winner_user_id: string | null;
  replay_json: string | null;
};

type MatchPlayerRow = {
  user_id: string;
  name: string;
  color: StoredMatchPlayer["color"];
};

function toSafeUser(user: StoredUser): SafeUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function toStoredUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    emailNormalized: row.email_normalized,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    passwordUpdatedAt: row.password_updated_at,
    failedLoginCount: row.failed_login_count,
    lockedUntil: row.locked_until,
    lastLoginAt: row.last_login_at,
  };
}

function toStoredSession(row: SessionRow): StoredSession {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    userAgentHash: row.user_agent_hash,
    revokedAt: row.revoked_at,
  };
}

function parseReplay(raw: string | null): MatchReplay | null {
  return raw ? JSON.parse(raw) as MatchReplay : null;
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

function isSqliteConstraint(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE");
}

export class AuthStore {
  private queue = Promise.resolve();
  private database: Database.Database | null = null;
  private databasePath: string | null = null;

  async registerUser(input: { email: string; displayName: string; password: string }, now = Date.now()) {
    return this.enqueue(async () => {
      const db = this.db();
      const emailNormalized = normalizeEmail(input.email);
      if (this.userByEmail(db, emailNormalized)) {
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

      try {
        this.insertUser(db, user);
      } catch (error) {
        if (isSqliteConstraint(error)) throw new AuthError("EMAIL_IN_USE", "An account already exists for that email.");
        throw error;
      }
      return toSafeUser(user);
    });
  }

  async authenticate(input: { email: string; password: string; userAgent?: string | null }, now = Date.now()) {
    return this.enqueue(async () => {
      const db = this.db();
      const emailNormalized = normalizeEmail(input.email);
      const user = this.userByEmail(db, emailNormalized);
      const locked = user?.lockedUntil && user.lockedUntil > now;
      const passwordMatches = await verifyPassword(input.password, user?.passwordSalt, user?.passwordHash);

      if (!user || locked || !passwordMatches) {
        if (user && !locked) {
          const failedLoginCount = user.failedLoginCount + 1;
          db.prepare(`
            UPDATE users
            SET failed_login_count = ?, locked_until = ?, updated_at = ?
            WHERE id = ?
          `).run(
            failedLoginCount,
            failedLoginCount >= MAX_FAILED_LOGINS ? now + LOGIN_LOCK_MS : null,
            now,
            user.id,
          );
        }
        throw new AuthError("INVALID_CREDENTIALS", "The email or password was not accepted.");
      }

      const session = this.createSessionRecord(user.id, input.userAgent, now);
      const writeLogin = db.transaction(() => {
        db.prepare(`
          UPDATE users
          SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
          WHERE id = ?
        `).run(now, now, user.id);
        this.cleanExpiredSessions(db, now);
        this.pruneUserSessions(db, user.id, MAX_SESSIONS_PER_USER - 1);
        this.insertSession(db, session.record);
      });
      writeLogin();

      return { user: toSafeUser({ ...user, failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now }), token: session.token, expiresAt: session.record.expiresAt };
    });
  }

  async createSession(userId: string, userAgent?: string | null, now = Date.now()) {
    return this.enqueue(async () => {
      const db = this.db();
      const user = this.userById(db, userId);
      if (!user) throw new AuthError("USER_NOT_FOUND", "User does not exist.");
      const session = this.createSessionRecord(user.id, userAgent, now);
      const writeSession = db.transaction(() => {
        this.cleanExpiredSessions(db, now);
        this.pruneUserSessions(db, user.id, MAX_SESSIONS_PER_USER - 1);
        this.insertSession(db, session.record);
      });
      writeSession();
      return { user: toSafeUser(user), token: session.token, expiresAt: session.record.expiresAt };
    });
  }

  async validateSessionToken(token: string | null | undefined, now?: number): Promise<SessionValidation | null> {
    if (!token || token.length < 32 || token.length > 256) return null;
    const checkedAt = now ?? Date.now();
    return this.enqueue(async () => {
      const db = this.db();
      const session = this.sessionByToken(db, tokenHash(token));
      if (!session || session.revokedAt || session.expiresAt <= checkedAt) return null;
      const user = this.userById(db, session.userId);
      if (!user) return null;

      if (checkedAt - session.lastSeenAt >= SESSION_TOUCH_INTERVAL_MS) {
        const touchSession = db.transaction(() => {
          db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(checkedAt, session.id);
          this.cleanExpiredSessions(db, checkedAt);
        });
        touchSession();
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
      this.db().prepare(`
        UPDATE sessions
        SET revoked_at = ?
        WHERE token_hash = ? AND revoked_at IS NULL
      `).run(now, tokenHash(token));
    });
  }

  async updateProfile(userId: string, input: { displayName: string }, now = Date.now()) {
    return this.enqueue(async () => {
      const db = this.db();
      const user = this.userById(db, userId);
      if (!user) throw new AuthError("USER_NOT_FOUND", "User does not exist.");
      db.prepare("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?").run(input.displayName.trim(), now, userId);
      return toSafeUser({ ...user, displayName: input.displayName.trim(), updatedAt: now });
    });
  }

  async recordMatch(match: FinishedRoomMatch) {
    return this.enqueue(async () => {
      const db = this.db();
      const matchId = `${match.roomCode}:${match.gameId}:${match.startedAt}`;
      const writeMatch = db.transaction(() => {
        const existing = db.prepare("SELECT id FROM matches WHERE id = ?").get(matchId);
        if (existing) return false;

        db.prepare(`
          INSERT INTO matches (id, room_code, game_id, started_at, finished_at, winner_user_id, replay_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          matchId,
          match.roomCode,
          match.gameId,
          match.startedAt,
          match.finishedAt,
          match.winnerUserId,
          JSON.stringify(match.replay),
        );

        const insertPlayer = db.prepare(`
          INSERT INTO match_players (match_id, user_id, name, color, position)
          VALUES (?, ?, ?, ?, ?)
        `);
        match.players.forEach((player, index) => {
          insertPlayer.run(matchId, player.userId, player.name, player.color, index);
        });
        this.pruneMatches(db);
        return true;
      });
      return writeMatch();
    });
  }

  async getDashboard(userId: string): Promise<AccountDashboard | null> {
    return this.enqueue(async () => {
      const db = this.db();
      const user = this.userById(db, userId);
      if (!user) return null;

      const rows = db.prepare(`
        SELECT m.*
        FROM matches m
        INNER JOIN match_players mp ON mp.match_id = m.id
        WHERE mp.user_id = ?
        ORDER BY m.finished_at DESC, m.started_at DESC
      `).all(userId) as MatchRow[];
      const matches = rows.map((row) => this.toStoredMatch(db, row));
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
      const db = this.db();
      const row = db.prepare(`
        SELECT m.*
        FROM matches m
        WHERE m.id = ?
          AND EXISTS (
            SELECT 1 FROM match_players mp
            WHERE mp.match_id = m.id AND mp.user_id = ?
          )
      `).get(matchId, userId) as MatchRow | undefined;
      return row ? this.toStoredMatch(db, row) : null;
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

  private db() {
    const nextPath = storePath();
    if (this.database && this.databasePath === nextPath) return this.database;

    this.database?.close();
    mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
    const db = new Database(nextPath, { timeout: 5_000 });
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    this.createSchema(db);
    this.migrateLegacyJson(db);
    try {
      chmodSync(nextPath, 0o600);
    } catch {
      // Some filesystems do not support chmod; SQLite can still operate safely.
    }

    this.database = db;
    this.databasePath = nextPath;
    return db;
  }

  private createSchema(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS auth_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        email_normalized TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_updated_at INTEGER NOT NULL,
        failed_login_count INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER,
        last_login_at INTEGER
      ) STRICT;

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        user_agent_hash TEXT,
        revoked_at INTEGER
      ) STRICT;

      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        game_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER NOT NULL,
        winner_user_id TEXT,
        replay_json TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS match_players (
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (match_id, user_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions(user_id, revoked_at, expires_at, created_at);
      CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS matches_finished_idx ON matches(finished_at DESC, started_at DESC);
      CREATE INDEX IF NOT EXISTS match_players_user_idx ON match_players(user_id, match_id);
    `);
    db.prepare("INSERT OR REPLACE INTO auth_meta (key, value) VALUES ('schema_version', '1')").run();
  }

  private migrateLegacyJson(db: Database.Database) {
    const alreadyImported = db.prepare("SELECT value FROM auth_meta WHERE key = 'legacy_json_imported'").get();
    if (alreadyImported || !existsSync(legacyStorePath())) return;

    const existingRows = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users)
        + (SELECT COUNT(*) FROM sessions)
        + (SELECT COUNT(*) FROM matches) AS count
    `).get() as { count: number };
    if (existingRows.count > 0) {
      db.prepare("INSERT OR REPLACE INTO auth_meta (key, value) VALUES ('legacy_json_imported', 'skipped-existing-data')").run();
      return;
    }

    const parsed = JSON.parse(readFileSync(legacyStorePath(), "utf8")) as AuthData;
    if (parsed.version !== 1 || !Array.isArray(parsed.users) || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.matches)) {
      throw new Error("Legacy auth store is malformed.");
    }

    const migrate = db.transaction((data: AuthData) => {
      for (const user of data.users) this.insertUser(db, user);
      for (const session of data.sessions) this.insertSession(db, session);
      for (const match of data.matches) {
        db.prepare(`
          INSERT INTO matches (id, room_code, game_id, started_at, finished_at, winner_user_id, replay_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          match.id,
          match.roomCode,
          match.gameId,
          match.startedAt,
          match.finishedAt,
          match.winnerUserId,
          match.replay ? JSON.stringify(match.replay) : null,
        );
        const insertPlayer = db.prepare(`
          INSERT INTO match_players (match_id, user_id, name, color, position)
          VALUES (?, ?, ?, ?, ?)
        `);
        match.players.forEach((player, index) => insertPlayer.run(match.id, player.userId, player.name, player.color, index));
      }
      db.prepare("INSERT OR REPLACE INTO auth_meta (key, value) VALUES ('legacy_json_imported', ?)").run(String(Date.now()));
    });
    migrate(parsed);
  }

  private insertUser(db: Database.Database, user: StoredUser) {
    db.prepare(`
      INSERT INTO users (
        id, email, email_normalized, display_name, role, created_at, updated_at,
        password_hash, password_salt, password_updated_at, failed_login_count,
        locked_until, last_login_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      user.email,
      user.emailNormalized,
      user.displayName,
      user.role,
      user.createdAt,
      user.updatedAt,
      user.passwordHash,
      user.passwordSalt,
      user.passwordUpdatedAt,
      user.failedLoginCount,
      user.lockedUntil,
      user.lastLoginAt,
    );
  }

  private insertSession(db: Database.Database, session: StoredSession) {
    db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, user_agent_hash, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.userId,
      session.tokenHash,
      session.createdAt,
      session.expiresAt,
      session.lastSeenAt,
      session.userAgentHash,
      session.revokedAt,
    );
  }

  private userById(db: Database.Database, userId: string) {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
    return row ? toStoredUser(row) : null;
  }

  private userByEmail(db: Database.Database, emailNormalized: string) {
    const row = db.prepare("SELECT * FROM users WHERE email_normalized = ?").get(emailNormalized) as UserRow | undefined;
    return row ? toStoredUser(row) : null;
  }

  private sessionByToken(db: Database.Database, hashedToken: string) {
    const row = db.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(hashedToken) as SessionRow | undefined;
    return row ? toStoredSession(row) : null;
  }

  private cleanExpiredSessions(db: Database.Database, now: number) {
    db.prepare("DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL").run(now);
  }

  private pruneUserSessions(db: Database.Database, userId: string, keep: number) {
    db.prepare(`
      DELETE FROM sessions
      WHERE user_id = ?
        AND id NOT IN (
          SELECT id
          FROM sessions
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        )
    `).run(userId, userId, keep);
  }

  private pruneMatches(db: Database.Database) {
    db.prepare(`
      DELETE FROM matches
      WHERE id NOT IN (
        SELECT id
        FROM matches
        ORDER BY finished_at DESC, started_at DESC
        LIMIT ?
      )
    `).run(MAX_MATCHES);
  }

  private toStoredMatch(db: Database.Database, row: MatchRow): StoredMatch {
    const players = db.prepare(`
      SELECT user_id, name, color
      FROM match_players
      WHERE match_id = ?
      ORDER BY position ASC
    `).all(row.id) as MatchPlayerRow[];
    return {
      id: row.id,
      roomCode: row.room_code,
      gameId: row.game_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      winnerUserId: row.winner_user_id,
      players: players.map((player) => ({
        userId: player.user_id,
        name: player.name,
        color: player.color,
      })),
      replay: parseReplay(row.replay_json),
    };
  }
}

export { AuthError };
export const authStore = new AuthStore();

import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { io } from "socket.io-client";

const url = process.env.LUDO_URL ?? "http://localhost:3000";
const origin = new URL(url).origin;
const authDataDir = process.env.AUTH_DATA_DIR || path.join(process.cwd(), ".data");
const authStorePath = path.join(authDataDir, "auth-store.sqlite");
const sessionCookieName = "ludo_session";
let authDb;

function connect(options = {}) {
  return new Promise((resolve, reject) => {
    const socket = io(url, { forceNew: true, timeout: 5_000, ...options });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (error) => {
      socket.close();
      reject(error);
    });
  });
}

async function getAuthDb() {
  await mkdir(authDataDir, { recursive: true, mode: 0o700 });
  if (authDb) return authDb;
  authDb = new Database(authStorePath, { timeout: 5_000 });
  authDb.pragma("foreign_keys = ON");
  authDb.pragma("journal_mode = WAL");
  authDb.exec(`
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
  `);
  return authDb;
}

async function createSmokeSession(displayName) {
  const now = Date.now();
  const token = randomBytes(32).toString("base64url");
  const emailNormalized = `${displayName.toLowerCase()}-${randomUUID()}@smoke.local`;
  const userId = randomUUID();
  const db = await getAuthDb();
  db.transaction(() => {
    db.prepare(`
      INSERT INTO users (
        id, email, email_normalized, display_name, role, created_at, updated_at,
        password_hash, password_salt, password_updated_at, failed_login_count,
        locked_until, last_login_at
      )
      VALUES (?, ?, ?, ?, 'user', ?, ?, 'smoke', 'smoke', ?, 0, NULL, ?)
    `).run(userId, emailNormalized, emailNormalized, displayName, now, now, now, now);
    db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, user_agent_hash, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)
    `).run(
      randomUUID(),
      userId,
      createHash("sha256").update(token).digest("base64url"),
      now,
      now + 7 * 24 * 60 * 60 * 1000,
      now,
    );
  })();
  return `${sessionCookieName}=${token}`;
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 5_000);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

const healthResponse = await fetch(`${url}/api/health`);
const health = await healthResponse.json();
assert.equal(health.ok, true);
assert.equal(health.uptime, undefined);
assert.equal(healthResponse.headers.get("x-content-type-options"), "nosniff");
assert.equal((await fetch(`${url}/api/health`, { method: "POST" })).status, 405);

const homeResponse = await fetch(url);
assert.match(homeResponse.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
assert.equal(homeResponse.headers.has("x-powered-by"), false);

await assert.rejects(
  connect({ extraHeaders: { Origin: "https://attacker.example" } }),
);
const hostCookie = await createSmokeSession("Ada");
const guestCookie = await createSmokeSession("Linus");
await assert.rejects(
  connect({
    extraHeaders: {
      Origin: "https://attacker.example",
      Cookie: hostCookie,
      "X-Forwarded-Host": "attacker.example",
      "X-Forwarded-Proto": "https",
    },
  }),
);
await assert.rejects(connect({ extraHeaders: { Origin: origin } }));
const browserLikeSocket = await connect({ extraHeaders: { Origin: origin, Cookie: hostCookie } });
browserLikeSocket.disconnect();

const host = await connect({ extraHeaders: { Cookie: hostCookie } });
const guest = await connect({ extraHeaders: { Cookie: guestCookie } });
const created = await emit(host, "create_room", {});
assert.equal(created.ok, true);
assert.equal(created.snapshot.players.length, 1);

const joined = await emit(guest, "join_room", { code: created.identity.roomCode });
assert.equal(joined.ok, true);
assert.equal(joined.snapshot.players.length, 2);

const guestStart = await emit(guest, "start_game", { commandId: crypto.randomUUID() });
assert.equal(guestStart.ok, false);
assert.equal(guestStart.error.code, "HOST_ONLY");

const started = await emit(host, "start_game", { commandId: crypto.randomUUID() });
assert.equal(started.ok, true);

const outOfTurn = await emit(guest, "roll_die", { commandId: crypto.randomUUID() });
assert.equal(outOfTurn.ok, false);
assert.equal(outOfTurn.error.code, "NOT_YOUR_TURN");

guest.disconnect();
const resumedGuest = await connect({ extraHeaders: { Cookie: guestCookie } });
const resumed = await emit(resumedGuest, "resume_room", {
  code: created.identity.roomCode,
  reconnectToken: joined.identity.reconnectToken,
});
assert.equal(resumed.ok, true);
assert.equal(resumed.snapshot.status, "playing");
assert.equal(resumed.snapshot.players.find((player) => player.id === joined.identity.playerId).connected, true);

host.disconnect();
resumedGuest.disconnect();
authDb?.close();
console.log(`Multiplayer smoke passed for room ${created.identity.roomCode}`);

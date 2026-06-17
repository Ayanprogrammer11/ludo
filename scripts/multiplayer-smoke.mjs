import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { io } from "socket.io-client";

const url = process.env.LUDO_URL ?? "http://localhost:3000";
const origin = new URL(url).origin;
const authDataDir = process.env.AUTH_DATA_DIR || path.join(process.cwd(), ".data");
const authStorePath = path.join(authDataDir, "auth-store.json");
const sessionCookieName = "ludo_session";

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

async function readAuthStore() {
  await mkdir(authDataDir, { recursive: true, mode: 0o700 });
  try {
    return JSON.parse(await readFile(authStorePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, users: [], sessions: [], matches: [] };
    throw error;
  }
}

async function writeAuthStore(data) {
  await mkdir(authDataDir, { recursive: true, mode: 0o700 });
  const tempPath = path.join(authDataDir, `auth-store.${randomUUID()}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await rename(tempPath, authStorePath);
}

async function createSmokeSession(displayName) {
  const now = Date.now();
  const token = randomBytes(32).toString("base64url");
  const emailNormalized = `${displayName.toLowerCase()}-${randomUUID()}@smoke.local`;
  const userId = randomUUID();
  const data = await readAuthStore();
  data.users.push({
    id: userId,
    email: emailNormalized,
    emailNormalized,
    displayName,
    role: "user",
    createdAt: now,
    updatedAt: now,
    passwordHash: "smoke",
    passwordSalt: "smoke",
    passwordUpdatedAt: now,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: now,
  });
  data.sessions.push({
    id: randomUUID(),
    userId,
    tokenHash: createHash("sha256").update(token).digest("base64url"),
    createdAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    lastSeenAt: now,
    userAgentHash: null,
    revokedAt: null,
  });
  await writeAuthStore(data);
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
console.log(`Multiplayer smoke passed for room ${created.identity.roomCode}`);

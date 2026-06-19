import { createHash } from "node:crypto";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStore } from "./store";

let authDataDir: string;

beforeEach(async () => {
  authDataDir = await mkdtemp(path.join(tmpdir(), "ludo-auth-"));
  process.env.AUTH_DATA_DIR = authDataDir;
});

afterEach(async () => {
  delete process.env.AUTH_DATA_DIR;
  await rm(authDataDir, { force: true, recursive: true });
});

describe("AuthStore", () => {
  it("registers users, creates opaque sessions, and revokes sessions", async () => {
    const store = new AuthStore();
    const user = await store.registerUser({
      displayName: "Ada",
      email: "Ada@example.com",
      password: "CorrectHorse42!",
    }, 1);
    const login = await store.authenticate({
      email: "ada@example.com",
      password: "CorrectHorse42!",
      userAgent: "vitest",
    }, 2);

    expect(user.email).toBe("Ada@example.com");
    expect(login.token).not.toContain(user.id);
    await expect(store.authenticate({ email: "ada@example.com", password: "wrong" }, 3)).rejects.toThrow();
    await expect(store.registerUser({ displayName: "Ada 2", email: "ADA@example.com", password: "CorrectHorse42!" }, 4)).rejects.toThrow();

    const session = await store.validateSessionToken(login.token, 5);
    expect(session?.user.id).toBe(user.id);

    await store.revokeSessionToken(login.token, 6);
    await expect(store.validateSessionToken(login.token, 7)).resolves.toBeNull();
    await expect(access(path.join(authDataDir, "auth-store.sqlite"))).resolves.toBeUndefined();
  });

  it("records finished matches idempotently and builds dashboard stats", async () => {
    const store = new AuthStore();
    const ada = await store.registerUser({ displayName: "Ada", email: "ada@example.com", password: "CorrectHorse42!" }, 1);
    const linus = await store.registerUser({ displayName: "Linus", email: "linus@example.com", password: "CorrectHorse42!" }, 2);

    const match = {
      roomCode: "ABC234",
      gameId: "room-ABC234",
      startedAt: 10,
      finishedAt: 20,
      winnerUserId: ada.id,
      players: [
        { userId: ada.id, name: "Ada", color: "red" as const },
        { userId: linus.id, name: "Linus", color: "green" as const },
      ],
      replay: {
        turnDurationMs: 90_000,
        activeDisconnectGraceMs: 30_000,
        waitingDisconnectGraceMs: 120_000,
        frames: [],
      },
    };

    await expect(store.recordMatch(match)).resolves.toBe(true);
    await expect(store.recordMatch(match)).resolves.toBe(false);

    const adaDashboard = await store.getDashboard(ada.id);
    const linusDashboard = await store.getDashboard(linus.id);
    expect(adaDashboard?.stats).toEqual({ matchesPlayed: 1, wins: 1, losses: 0, winRate: 100 });
    expect(linusDashboard?.stats).toEqual({ matchesPlayed: 1, wins: 0, losses: 1, winRate: 0 });
    expect(adaDashboard?.recentMatches[0].winnerName).toBe("Ada");
    expect(adaDashboard?.recentMatches[0].hasReplay).toBe(false);
  });

  it("migrates a legacy JSON auth store into SQLite", async () => {
    const token = "legacy-session-token-123456789012";
    await writeFile(path.join(authDataDir, "auth-store.json"), `${JSON.stringify({
      version: 1,
      users: [{
        id: "legacy-user",
        email: "legacy@example.com",
        emailNormalized: "legacy@example.com",
        displayName: "Legacy",
        role: "user",
        createdAt: 1,
        updatedAt: 1,
        passwordHash: "hash",
        passwordSalt: "salt",
        passwordUpdatedAt: 1,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: 2,
      }],
      sessions: [{
        id: "legacy-session",
        userId: "legacy-user",
        tokenHash: createHash("sha256").update(token).digest("base64url"),
        createdAt: 2,
        expiresAt: 10_000,
        lastSeenAt: 2,
        userAgentHash: null,
        revokedAt: null,
      }],
      matches: [{
        id: "ABC234:legacy-game:20",
        roomCode: "ABC234",
        gameId: "legacy-game",
        startedAt: 20,
        finishedAt: 30,
        winnerUserId: "legacy-user",
        players: [{ userId: "legacy-user", name: "Legacy", color: "red" }],
        replay: null,
      }],
    })}\n`);

    const store = new AuthStore();
    const session = await store.validateSessionToken(token, 3);
    const dashboard = await store.getDashboard("legacy-user");

    expect(session?.user.displayName).toBe("Legacy");
    expect(dashboard?.stats).toEqual({ matchesPlayed: 1, wins: 1, losses: 0, winRate: 100 });
    await expect(access(path.join(authDataDir, "auth-store.sqlite"))).resolves.toBeUndefined();
  });
});

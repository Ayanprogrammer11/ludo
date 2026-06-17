import { mkdtemp, rm } from "node:fs/promises";
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
    };

    await expect(store.recordMatch(match)).resolves.toBe(true);
    await expect(store.recordMatch(match)).resolves.toBe(false);

    const adaDashboard = await store.getDashboard(ada.id);
    const linusDashboard = await store.getDashboard(linus.id);
    expect(adaDashboard?.stats).toEqual({ matchesPlayed: 1, wins: 1, losses: 0, winRate: 100 });
    expect(linusDashboard?.stats).toEqual({ matchesPlayed: 1, wins: 0, losses: 1, winRate: 0 });
    expect(adaDashboard?.recentMatches[0].winnerName).toBe("Ada");
  });
});

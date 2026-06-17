import { describe, expect, it } from "vitest";
import { RoomError, RoomService, type RoomAccount } from "./room-service";

function account(displayName: string): RoomAccount {
  return { id: `account-${displayName.toLowerCase()}`, displayName };
}

describe("RoomService", () => {
  it("creates, joins, starts, and authorizes a room", () => {
    const service = new RoomService();
    const host = service.createRoom(account("Ada"), "socket-a", 1);
    const guest = service.joinRoom(host.identity.roomCode, account("Linus"), "socket-b", 2);
    const started = service.startGame(host.identity.roomCode, host.identity.playerId, "socket-a", crypto.randomUUID(), 3);

    expect(host.snapshot.players[0]).not.toHaveProperty("accountId");
    expect(started.status).toBe("playing");
    expect(started.game?.players.map((player) => player.id)).toEqual([host.identity.playerId, guest.identity.playerId]);
    expect(() => service.roll(host.identity.roomCode, guest.identity.playerId, "socket-b", crypto.randomUUID())).toThrowError(RoomError);
  });

  it("reconnects without duplicating a player and invalidates the stale socket", () => {
    const service = new RoomService();
    const host = service.createRoom(account("Ada"), "old-socket");
    service.disconnectSocket("old-socket");
    const resumed = service.resumeRoom(host.identity.roomCode, host.identity.reconnectToken, account("Ada"), "new-socket");

    expect(resumed.snapshot.players).toHaveLength(1);
    expect(resumed.snapshot.players[0].connected).toBe(true);
    expect(resumed.identity.reconnectToken).not.toBe(host.identity.reconnectToken);
    expect(() => service.resumeRoom(host.identity.roomCode, host.identity.reconnectToken, account("Ada"), "replay-socket")).toThrowError(RoomError);
    expect(() => service.startGame(host.identity.roomCode, host.identity.playerId, "old-socket", crypto.randomUUID())).toThrowError(RoomError);
  });

  it("does not let a different account replay a reconnect token", () => {
    const service = new RoomService();
    const host = service.createRoom(account("Ada"), "old-socket");
    service.disconnectSocket("old-socket");

    expect(() => service.resumeRoom(host.identity.roomCode, host.identity.reconnectToken, account("Linus"), "new-socket")).toThrowError(RoomError);
  });

  it("does not let one socket bind itself to another player", () => {
    const service = new RoomService();
    const host = service.createRoom(account("Ada"), "socket-a");
    const guest = service.joinRoom(host.identity.roomCode, account("Linus"), "socket-b");

    expect(() => service.resumeRoom(host.identity.roomCode, guest.identity.reconnectToken, account("Linus"), "socket-a")).toThrowError(RoomError);
  });

  it("bounds the number of active rooms", () => {
    const service = new RoomService(1);
    service.createRoom(account("Ada"), "socket-a");

    expect(() => service.createRoom(account("Linus"), "socket-b")).toThrowError(RoomError);
  });

  it("makes repeated commands idempotent", () => {
    const service = new RoomService();
    const host = service.createRoom(account("Ada"), "socket-a");
    service.joinRoom(host.identity.roomCode, account("Linus"), "socket-b");
    const commandId = crypto.randomUUID();
    const first = service.startGame(host.identity.roomCode, host.identity.playerId, "socket-a", commandId, 10);
    const repeated = service.startGame(host.identity.roomCode, host.identity.playerId, "socket-a", commandId, 20);

    expect(repeated.version).toBe(first.version);
    expect(repeated).toEqual(first);
  });

  it("preserves a running match when a player disconnects", () => {
    const service = new RoomService();
    const host = service.createRoom(account("Ada"), "socket-a");
    const guest = service.joinRoom(host.identity.roomCode, account("Linus"), "socket-b");
    service.startGame(host.identity.roomCode, host.identity.playerId, "socket-a", crypto.randomUUID());
    const disconnected = service.disconnectSocket("socket-b");

    expect(disconnected?.status).toBe("playing");
    expect(disconnected?.players.find((player) => player.id === guest.identity.playerId)?.connected).toBe(false);
    expect(disconnected?.game?.players.find((player) => player.id === guest.identity.playerId)?.connected).toBe(false);
  });

  it("migrates host authority when a waiting host disconnects", () => {
    const service = new RoomService();
    const host = service.createRoom(account("Ada"), "socket-a");
    const guest = service.joinRoom(host.identity.roomCode, account("Linus"), "socket-b");
    const snapshot = service.disconnectSocket("socket-a");

    expect(snapshot?.hostPlayerId).toBe(guest.identity.playerId);
    expect(snapshot?.players.find((player) => player.id === guest.identity.playerId)?.isHost).toBe(true);
  });

  it("skips a disconnected active player after the reconnect grace period", () => {
    const service = new RoomService();
    const host = service.createRoom(account("Ada"), "socket-a", 1);
    const guest = service.joinRoom(host.identity.roomCode, account("Linus"), "socket-b", 2);
    service.startGame(host.identity.roomCode, host.identity.playerId, "socket-a", crypto.randomUUID(), 3);
    service.disconnectSocket("socket-a", 100);
    const [snapshot] = service.maintainRooms(30_101);

    expect(snapshot.game?.currentPlayerId).toBe(guest.identity.playerId);
    expect(snapshot.game?.events[0].message).toContain("timed out");
  });
});

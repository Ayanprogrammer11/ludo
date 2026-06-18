import { randomInt, randomUUID } from "node:crypto";
import type { FinishedRoomMatch, MatchReplayFrame } from "../auth/types";
import { createGameForPlayers, forfeitPlayer, moveToken, rollDie, skipTurn } from "../game/engine";
import { PLAYER_COLORS } from "../game/types";
import type { RoomIdentity, RoomPlayer, RoomSnapshot } from "./types";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const WAITING_DISCONNECT_GRACE_MS = 2 * 60 * 1000;
const TURN_DURATION_MS = 90 * 1000;
const ACTIVE_DISCONNECT_GRACE_MS = 30 * 1000;
const MAX_MISSED_TURNS = 3;
const MAX_COMMAND_HISTORY = 500;
const MAX_REPLAY_FRAMES = 2_000;
const DEFAULT_MAX_ROOMS = 10_000;

type InternalRoom = Omit<RoomSnapshot, "players"> & {
  players: InternalRoomPlayer[];
  reconnectTokens: Map<string, string>;
  socketIds: Map<string, string>;
  commandIds: Set<string>;
  disconnectedAt: Map<string, number>;
  replayFrames: MatchReplayFrame[];
};

type InternalRoomPlayer = RoomPlayer & {
  accountId: string;
};

export type RoomAccount = {
  id: string;
  displayName: string;
};

export class RoomError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export type JoinResult = {
  identity: RoomIdentity;
  snapshot: RoomSnapshot;
  displacedSocketId?: string;
};

export class RoomService {
  private rooms = new Map<string, InternalRoom>();
  private socketIndex = new Map<string, { code: string; playerId: string }>();

  constructor(private maxRooms = DEFAULT_MAX_ROOMS) {}

  createRoom(account: RoomAccount, socketId: string, now = Date.now()): JoinResult {
    if (this.rooms.size >= this.maxRooms) {
      this.deleteExpired(now);
      if (this.rooms.size >= this.maxRooms) {
        throw new RoomError("SERVER_CAPACITY", "The server is at room capacity. Try again shortly.");
      }
    }
    const code = this.createUniqueCode();
    const playerId = randomUUID();
    const reconnectToken = randomUUID();
    const player: InternalRoomPlayer = {
      id: playerId,
      accountId: account.id,
      name: account.displayName,
      color: "red",
      connected: true,
      leftAt: null,
      missedTurns: 0,
      isHost: true,
      joinedAt: now,
    };
    const room: InternalRoom = {
      code,
      status: "waiting",
      players: [player],
      hostPlayerId: playerId,
      game: null,
      turnDeadline: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      reconnectTokens: new Map([[reconnectToken, playerId]]),
      socketIds: new Map([[playerId, socketId]]),
      commandIds: new Set(),
      disconnectedAt: new Map(),
      replayFrames: [],
    };
    this.rooms.set(code, room);
    this.socketIndex.set(socketId, { code, playerId });
    return { identity: { roomCode: code, playerId, reconnectToken }, snapshot: this.snapshot(room) };
  }

  joinRoom(code: string, account: RoomAccount, socketId: string, now = Date.now()): JoinResult {
    const room = this.requireRoom(code);
    if (room.status !== "waiting") throw new RoomError("GAME_STARTED", "This match has already started.");
    if (room.players.length >= 4) throw new RoomError("ROOM_FULL", "This room already has four players.");
    if (room.players.some((player) => player.accountId === account.id)) {
      throw new RoomError("ALREADY_JOINED", "This account already has a seat at the table.");
    }

    const playerId = randomUUID();
    const reconnectToken = randomUUID();
    room.players.push({
      id: playerId,
      accountId: account.id,
      name: account.displayName,
      color: PLAYER_COLORS[room.players.length],
      connected: true,
      leftAt: null,
      missedTurns: 0,
      isHost: false,
      joinedAt: now,
    });
    room.reconnectTokens.set(reconnectToken, playerId);
    room.socketIds.set(playerId, socketId);
    room.disconnectedAt.delete(playerId);
    this.socketIndex.set(socketId, { code: room.code, playerId });
    this.touch(room, now);
    return { identity: { roomCode: room.code, playerId, reconnectToken }, snapshot: this.snapshot(room) };
  }

  resumeRoom(code: string, reconnectToken: string, account: RoomAccount, socketId: string, now = Date.now()): JoinResult {
    const room = this.requireRoom(code);
    const playerId = room.reconnectTokens.get(reconnectToken);
    if (!playerId) throw new RoomError("SESSION_EXPIRED", "That reconnect link is no longer valid.");
    const existingBinding = this.socketIndex.get(socketId);
    if (existingBinding && (existingBinding.code !== room.code || existingBinding.playerId !== playerId)) {
      throw new RoomError("ALREADY_IN_ROOM", "This connection is already bound to another player.");
    }
    const player = room.players.find((candidate) => candidate.id === playerId)!;
    if (player.accountId !== account.id) throw new RoomError("ACCOUNT_MISMATCH", "Sign in with the account that joined this room.");
    if (player.leftAt) throw new RoomError("SEAT_CLOSED", "That seat has already left this room.");
    const displacedSocketId = room.socketIds.get(playerId);
    const sameSocketResume = displacedSocketId === socketId;
    const nextReconnectToken = sameSocketResume ? reconnectToken : randomUUID();
    player.connected = true;
    player.missedTurns = 0;
    if (!sameSocketResume) {
      room.reconnectTokens.delete(reconnectToken);
      room.reconnectTokens.set(nextReconnectToken, playerId);
    }
    room.socketIds.set(playerId, socketId);
    this.socketIndex.set(socketId, { code: room.code, playerId });
    if (displacedSocketId && displacedSocketId !== socketId) this.socketIndex.delete(displacedSocketId);
    room.disconnectedAt.delete(playerId);
    this.syncGameConnections(room);
    if (room.game?.currentPlayerId === playerId) room.turnDeadline = now + TURN_DURATION_MS;
    this.touch(room, now);
    return {
      identity: { roomCode: room.code, playerId, reconnectToken: nextReconnectToken },
      snapshot: this.snapshot(room),
      displacedSocketId: displacedSocketId === socketId ? undefined : displacedSocketId,
    };
  }

  disconnectSocket(socketId: string, now = Date.now()): RoomSnapshot | null {
    const binding = this.socketIndex.get(socketId);
    this.socketIndex.delete(socketId);
    if (!binding) return null;
    const room = this.rooms.get(binding.code);
    if (!room || room.socketIds.get(binding.playerId) !== socketId) return null;
    room.socketIds.delete(binding.playerId);
    const player = room.players.find((candidate) => candidate.id === binding.playerId);
    if (player) player.connected = false;
    room.disconnectedAt.set(binding.playerId, now);
    this.syncGameConnections(room);
    if (room.status === "waiting" && room.hostPlayerId === binding.playerId) this.migrateHost(room);
    if (room.game?.currentPlayerId === binding.playerId && room.turnDeadline) {
      room.turnDeadline = Math.min(room.turnDeadline, now + ACTIVE_DISCONNECT_GRACE_MS);
    }
    this.touch(room, now);
    return this.snapshot(room);
  }

  startGame(code: string, playerId: string, socketId: string, commandId: string, now = Date.now()): RoomSnapshot {
    const room = this.authorize(code, playerId, socketId);
    if (room.commandIds.has(commandId)) return this.snapshot(room);
    if (room.hostPlayerId !== playerId) throw new RoomError("HOST_ONLY", "Only the host can start the match.");
    if (room.status !== "waiting") throw new RoomError("ALREADY_STARTED", "The match has already started.");
    if (room.players.length < 2) throw new RoomError("NOT_ENOUGH_PLAYERS", "At least two players are needed.");
    if (room.players.some((player) => !player.connected)) {
      throw new RoomError("PLAYER_OFFLINE", "Everyone must be connected before the match starts.");
    }
    room.game = createGameForPlayers(room.players, `room-${room.code}`);
    room.status = "playing";
    room.turnDeadline = now + TURN_DURATION_MS;
    this.recordReplayFrame(room, now, "Match started");
    return this.commitCommand(room, commandId, now);
  }

  roll(code: string, playerId: string, socketId: string, commandId: string, now = Date.now()): RoomSnapshot {
    const room = this.authorize(code, playerId, socketId);
    if (room.commandIds.has(commandId)) return this.snapshot(room);
    const game = this.requirePlayableGame(room);
    if (game.currentPlayerId !== playerId) throw new RoomError("NOT_YOUR_TURN", "Wait for your turn.");
    room.game = rollDie(game, randomInt(1, 7));
    this.resetMissedTurns(room, playerId);
    if (room.game.winnerId) room.status = "finished";
    room.turnDeadline = room.game.winnerId ? null : now + TURN_DURATION_MS;
    this.recordReplayFrame(room, now, room.game.events[0]?.message ?? "Die rolled");
    return this.commitCommand(room, commandId, now);
  }

  move(code: string, playerId: string, socketId: string, commandId: string, tokenId: string, now = Date.now()): RoomSnapshot {
    const room = this.authorize(code, playerId, socketId);
    if (room.commandIds.has(commandId)) return this.snapshot(room);
    const game = this.requirePlayableGame(room);
    if (game.currentPlayerId !== playerId) throw new RoomError("NOT_YOUR_TURN", "Wait for your turn.");
    try {
      room.game = moveToken(game, tokenId).state;
    } catch (error) {
      throw new RoomError("ILLEGAL_MOVE", error instanceof Error ? error.message : "That move is not legal.");
    }
    this.resetMissedTurns(room, playerId);
    if (room.game.winnerId) room.status = "finished";
    room.turnDeadline = room.game.winnerId ? null : now + TURN_DURATION_MS;
    this.recordReplayFrame(room, now, room.game.events[0]?.message ?? "Token moved");
    return this.commitCommand(room, commandId, now);
  }

  leaveRoom(code: string, playerId: string, socketId: string, commandId: string, now = Date.now()): RoomSnapshot | null {
    const room = this.authorize(code, playerId, socketId);
    if (room.commandIds.has(commandId)) return this.snapshot(room);
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new RoomError("PLAYER_NOT_FOUND", "That player is no longer in the room.");

    this.socketIndex.delete(socketId);
    room.socketIds.delete(playerId);
    this.deleteReconnectTokens(room, playerId);

    if (room.status === "waiting") {
      room.commandIds.add(commandId);
      room.players = room.players.filter((candidate) => candidate.id !== playerId);
      room.disconnectedAt.delete(playerId);
      if (room.players.length === 0) {
        this.rooms.delete(room.code);
        return null;
      }
      room.players.forEach((candidate, index) => { candidate.color = PLAYER_COLORS[index]; });
      this.migrateHost(room);
      return this.commitCommand(room, commandId, now);
    }

    player.connected = false;
    player.leftAt = now;
    player.missedTurns = MAX_MISSED_TURNS;
    this.syncGameConnections(room);
    if (room.game && room.status === "playing") {
      room.game = forfeitPlayer(room.game, playerId, `${player.name} left and forfeited the match`);
      this.syncGameConnections(room);
      room.status = room.game.winnerId ? "finished" : "playing";
      room.turnDeadline = room.game.winnerId ? null : now + TURN_DURATION_MS;
      this.recordReplayFrame(room, now, room.game.events[0]?.message ?? `${player.name} left`);
    }

    return this.commitCommand(room, commandId, now);
  }

  getRoom(code: string): RoomSnapshot | null {
    const room = this.rooms.get(code.toUpperCase());
    return room ? this.snapshot(room) : null;
  }

  getBinding(socketId: string) {
    return this.socketIndex.get(socketId) ?? null;
  }

  getFinishedMatch(code: string, finishedAt = Date.now()): FinishedRoomMatch | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room || room.status !== "finished" || !room.game) return null;
    const winner = room.players.find((player) => player.id === room.game?.winnerId);
    return {
      roomCode: room.code,
      gameId: room.game.id,
      startedAt: room.replayFrames[0]?.at ?? room.createdAt,
      finishedAt,
      players: room.players.map((player) => ({
        userId: player.accountId,
        name: player.name,
        color: player.color,
      })),
      winnerUserId: winner?.accountId ?? null,
      replay: {
        turnDurationMs: TURN_DURATION_MS,
        activeDisconnectGraceMs: ACTIVE_DISCONNECT_GRACE_MS,
        waitingDisconnectGraceMs: WAITING_DISCONNECT_GRACE_MS,
        frames: structuredClone(room.replayFrames),
      },
    };
  }

  deleteExpired(now = Date.now()): number {
    let deleted = 0;
    for (const [code, room] of this.rooms) {
      if (now - room.updatedAt <= ROOM_TTL_MS) continue;
      for (const socketId of room.socketIds.values()) this.socketIndex.delete(socketId);
      this.rooms.delete(code);
      deleted += 1;
    }
    return deleted;
  }

  maintainRooms(now = Date.now()): RoomSnapshot[] {
    const changed: RoomSnapshot[] = [];
    for (const [code, room] of this.rooms) {
      if (room.status === "waiting") {
        const removedIds = room.players
          .filter((player) => !player.connected && now - (room.disconnectedAt.get(player.id) ?? now) >= WAITING_DISCONNECT_GRACE_MS)
          .map((player) => player.id);
        if (removedIds.length > 0) {
          room.players = room.players.filter((player) => !removedIds.includes(player.id));
          for (const playerId of removedIds) {
            room.socketIds.delete(playerId);
            room.disconnectedAt.delete(playerId);
            for (const [token, tokenPlayerId] of room.reconnectTokens) {
              if (tokenPlayerId === playerId) room.reconnectTokens.delete(token);
            }
          }
          if (room.players.length === 0) {
            this.rooms.delete(code);
            continue;
          }
          room.players.forEach((player, index) => { player.color = PLAYER_COLORS[index]; });
          this.migrateHost(room);
          this.touch(room, now);
          changed.push(this.snapshot(room));
        }
        continue;
      }

      if (room.status === "playing" && room.game && room.turnDeadline && room.turnDeadline <= now) {
        if (!room.players.some((player) => player.connected && !player.leftAt)) {
          room.turnDeadline = now + TURN_DURATION_MS;
          continue;
        }
        this.expireCurrentTurn(room, now);
        this.touch(room, now);
        changed.push(this.snapshot(room));
      }
    }
    return changed;
  }

  private expireCurrentTurn(room: InternalRoom, now: number) {
    if (!room.game) return;
    const current = room.game.players.find((player) => player.id === room.game!.currentPlayerId)!;
    const roomPlayer = room.players.find((player) => player.id === current.id);
    if (roomPlayer) roomPlayer.missedTurns += 1;

    if ((roomPlayer?.missedTurns ?? 0) >= MAX_MISSED_TURNS) {
      if (roomPlayer) {
        roomPlayer.connected = false;
        roomPlayer.leftAt = roomPlayer.leftAt ?? now;
        const socketId = room.socketIds.get(roomPlayer.id);
        if (socketId) this.socketIndex.delete(socketId);
        room.socketIds.delete(roomPlayer.id);
        this.deleteReconnectTokens(room, roomPlayer.id);
      }
      room.game = forfeitPlayer(room.game, current.id, `${current.name} was removed after missing ${MAX_MISSED_TURNS} turns`);
      this.syncGameConnections(room);
      room.status = room.game.winnerId ? "finished" : "playing";
      room.turnDeadline = room.game.winnerId ? null : now + TURN_DURATION_MS;
      this.recordReplayFrame(room, now, room.game.events[0]?.message ?? `${current.name} was removed`);
      return;
    }

    room.game = skipTurn(room.game, `${current.name}'s turn timed out`);
    room.turnDeadline = now + TURN_DURATION_MS;
    this.recordReplayFrame(room, now, room.game.events[0]?.message ?? `${current.name}'s turn timed out`);
  }

  private resetMissedTurns(room: InternalRoom, playerId: string) {
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (player) player.missedTurns = 0;
  }

  private deleteReconnectTokens(room: InternalRoom, playerId: string) {
    for (const [token, tokenPlayerId] of room.reconnectTokens) {
      if (tokenPlayerId === playerId) room.reconnectTokens.delete(token);
    }
  }

  private recordReplayFrame(room: InternalRoom, now: number, label: string) {
    if (!room.game) return;
    room.replayFrames.push({
      at: now,
      label,
      turnDeadline: room.turnDeadline,
      state: structuredClone(room.game),
    });
    if (room.replayFrames.length > MAX_REPLAY_FRAMES) {
      room.replayFrames = room.replayFrames.slice(-MAX_REPLAY_FRAMES);
    }
  }

  private authorize(code: string, playerId: string, socketId: string): InternalRoom {
    const room = this.requireRoom(code);
    if (room.socketIds.get(playerId) !== socketId) {
      throw new RoomError("STALE_SESSION", "This player session was replaced or disconnected.");
    }
    return room;
  }

  private requirePlayableGame(room: InternalRoom) {
    if (room.status !== "playing" || !room.game) throw new RoomError("NOT_PLAYING", "This match is not in progress.");
    return room.game;
  }

  private requireRoom(code: string): InternalRoom {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "That room does not exist or has expired.");
    return room;
  }

  private commitCommand(room: InternalRoom, commandId: string, now: number): RoomSnapshot {
    this.touch(room, now);
    const snapshot = this.snapshot(room);
    room.commandIds.add(commandId);
    if (room.commandIds.size > MAX_COMMAND_HISTORY) {
      const oldest = room.commandIds.values().next().value;
      if (oldest) room.commandIds.delete(oldest);
    }
    return structuredClone(snapshot);
  }

  private touch(room: InternalRoom, now: number) {
    room.version += 1;
    room.updatedAt = now;
  }

  private syncGameConnections(room: InternalRoom) {
    if (!room.game) return;
    room.game.players = room.game.players.map((gamePlayer) => ({
      ...gamePlayer,
      connected: room.players.find((player) => player.id === gamePlayer.id)?.connected ?? false,
    }));
  }

  private snapshot(room: InternalRoom): RoomSnapshot {
    return structuredClone({
      code: room.code,
      status: room.status,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        connected: player.connected,
        leftAt: player.leftAt,
        missedTurns: player.missedTurns,
        isHost: player.isHost,
        joinedAt: player.joinedAt,
      })),
      hostPlayerId: room.hostPlayerId,
      game: room.game,
      turnDeadline: room.turnDeadline,
      version: room.version,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    });
  }

  private createUniqueCode(): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError("CODE_EXHAUSTED", "Could not create a unique room code.");
  }

  private migrateHost(room: InternalRoom) {
    const nextHost = room.players.find((player) => player.connected) ?? room.players[0];
    if (!nextHost) return;
    room.hostPlayerId = nextHost.id;
    room.players.forEach((player) => { player.isHost = player.id === nextHost.id; });
  }
}

import { createServer } from "node:http";
import next from "next";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { RoomError, RoomService, type JoinResult } from "./src/lib/realtime/room-service";
import {
  commandSchema,
  createRoomSchema,
  joinRoomSchema,
  moveSchema,
  resumeRoomSchema,
} from "./src/lib/realtime/schemas";
import type { Ack, RoomIdentity, RoomSnapshot } from "./src/lib/realtime/types";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const rooms = new RoomService();

const httpServer = createServer((request, response) => {
  if (request.url === "/api/health") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
    return;
  }
  void handle(request, response);
});

const io = new Server(httpServer, {
  maxHttpBufferSize: 20_000,
  perMessageDeflate: false,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

type PlayerSocket = Socket & {
  data: {
    roomCode?: string;
    playerId?: string;
  };
};

function toError(error: unknown) {
  if (error instanceof RoomError) return { code: error.code, message: error.message };
  if (error instanceof z.ZodError) return { code: "INVALID_INPUT", message: "Some room details were invalid." };
  console.error(error);
  return { code: "SERVER_ERROR", message: "Something went wrong on the server." };
}

function guard<T>(ack: unknown, action: () => T) {
  const respond = typeof ack === "function" ? ack as (result: Ack<T>) => void : () => undefined;
  try {
    respond({ ok: true, ...action() } as Ack<T>);
  } catch (error) {
    respond({ ok: false, error: toError(error) });
  }
}

function requireIdentity(socket: PlayerSocket): RoomIdentity {
  if (!socket.data.roomCode || !socket.data.playerId) {
    throw new RoomError("NOT_IN_ROOM", "Join the room before making a match command.");
  }
  return {
    roomCode: socket.data.roomCode,
    playerId: socket.data.playerId,
    reconnectToken: "",
  };
}

async function attach(socket: PlayerSocket, result: JoinResult) {
  if (result.displacedSocketId) {
    const displaced = io.sockets.sockets.get(result.displacedSocketId);
    displaced?.emit("session_replaced");
    displaced?.disconnect(true);
  }
  socket.data.roomCode = result.identity.roomCode;
  socket.data.playerId = result.identity.playerId;
  await socket.join(result.identity.roomCode);
  io.to(result.identity.roomCode).emit("room_state", result.snapshot);
}

function emitSnapshot(snapshot: RoomSnapshot) {
  io.to(snapshot.code).emit("room_state", snapshot);
}

io.on("connection", (rawSocket) => {
  const socket = rawSocket as PlayerSocket;

  socket.on("create_room", (raw, ack: (result: Ack<{ identity: RoomIdentity; snapshot: RoomSnapshot }>) => void) => {
    guard(ack, () => {
      if (rooms.getBinding(socket.id)) throw new RoomError("ALREADY_IN_ROOM", "This connection is already in a room.");
      const { name } = createRoomSchema.parse(raw);
      const result = rooms.createRoom(name, socket.id);
      void attach(socket, result);
      return { identity: result.identity, snapshot: result.snapshot };
    });
  });

  socket.on("join_room", (raw, ack: (result: Ack<{ identity: RoomIdentity; snapshot: RoomSnapshot }>) => void) => {
    guard(ack, () => {
      if (rooms.getBinding(socket.id)) throw new RoomError("ALREADY_IN_ROOM", "This connection is already in a room.");
      const { code, name } = joinRoomSchema.parse(raw);
      const result = rooms.joinRoom(code, name, socket.id);
      void attach(socket, result);
      return { identity: result.identity, snapshot: result.snapshot };
    });
  });

  socket.on("resume_room", (raw, ack: (result: Ack<{ identity: RoomIdentity; snapshot: RoomSnapshot }>) => void) => {
    guard(ack, () => {
      const { code, reconnectToken } = resumeRoomSchema.parse(raw);
      const result = rooms.resumeRoom(code, reconnectToken, socket.id);
      void attach(socket, result);
      return { identity: result.identity, snapshot: result.snapshot };
    });
  });

  socket.on("start_game", (raw, ack: (result: Ack) => void) => {
    guard(ack, () => {
      const { commandId } = commandSchema.parse(raw);
      const identity = requireIdentity(socket);
      const snapshot = rooms.startGame(identity.roomCode, identity.playerId, socket.id, commandId);
      emitSnapshot(snapshot);
      return undefined;
    });
  });

  socket.on("roll_die", (raw, ack: (result: Ack) => void) => {
    guard(ack, () => {
      const { commandId } = commandSchema.parse(raw);
      const identity = requireIdentity(socket);
      const snapshot = rooms.roll(identity.roomCode, identity.playerId, socket.id, commandId);
      emitSnapshot(snapshot);
      return undefined;
    });
  });

  socket.on("move_token", (raw, ack: (result: Ack) => void) => {
    guard(ack, () => {
      const { commandId, tokenId } = moveSchema.parse(raw);
      const identity = requireIdentity(socket);
      const snapshot = rooms.move(identity.roomCode, identity.playerId, socket.id, commandId, tokenId);
      emitSnapshot(snapshot);
      return undefined;
    });
  });

  socket.on("disconnect", () => {
    const snapshot = rooms.disconnectSocket(socket.id);
    if (snapshot) emitSnapshot(snapshot);
  });
});

setInterval(() => {
  for (const snapshot of rooms.maintainRooms()) emitSnapshot(snapshot);
  rooms.deleteExpired();
}, 1_000).unref();

async function start() {
  await app.prepare();
  httpServer.listen(port, hostname, () => {
    console.log(`> Ludo ready on http://${hostname}:${port} (${dev ? "development" : "production"})`);
  });
}

void start().catch((error) => {
  console.error(error);
  process.exit(1);
});

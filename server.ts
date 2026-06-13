import { createServer, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import next from "next";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { RateLimiter } from "./src/lib/realtime/rate-limit";
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
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be a valid TCP port.");
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const rooms = new RoomService();
const connectionLimiter = new RateLimiter(40, 60_000, 20_000);
const createRoomLimiter = new RateLimiter(10, 60_000, 20_000);
const roomAccessLimiter = new RateLimiter(60, 60_000, 20_000);
const commandLimiter = new RateLimiter(240, 60_000, 20_000);
const socketEventLimiter = new RateLimiter(120, 10_000, 20_000);
const MAX_CONNECTIONS = 2_000;

function firstHeader(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
}

function normalizeOrigin(value: string): string | null {
  try {
    const origin = new URL(value);
    return origin.protocol === "http:" || origin.protocol === "https:" ? origin.origin : null;
  } catch {
    return null;
  }
}

const allowedOrigins = new Set(
  (process.env.APP_ORIGINS ?? "")
    .split(",")
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter((origin): origin is string => Boolean(origin)),
);

function isAllowedOrigin(request: IncomingMessage): boolean {
  const rawOrigin = firstHeader(request.headers.origin);
  if (!rawOrigin) return true;
  const origin = normalizeOrigin(rawOrigin);
  if (!origin) return false;
  if (allowedOrigins.has(origin)) return true;

  const originUrl = new URL(origin);
  const host = firstHeader(request.headers["x-forwarded-host"]) ?? firstHeader(request.headers.host);
  const protocol = firstHeader(request.headers["x-forwarded-proto"]);
  return Boolean(
    host
    && originUrl.host.toLowerCase() === host.toLowerCase()
    && (!protocol || originUrl.protocol === `${protocol.toLowerCase()}:`),
  );
}

function clientKey(headers: IncomingHttpHeaders, fallback: string | undefined): string {
  const digitalOceanClientIp = firstHeader(headers["do-connecting-ip"]);
  return digitalOceanClientIp?.slice(0, 128) || fallback?.slice(0, 128) || "unknown";
}

const httpServer = createServer((request, response) => {
  if (request.url === "/api/health") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD", "cache-control": "no-store" });
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : JSON.stringify({ ok: true }));
    return;
  }
  void handle(request, response);
});
httpServer.requestTimeout = 15_000;
httpServer.headersTimeout = 10_000;
httpServer.keepAliveTimeout = 5_000;
httpServer.maxHeadersCount = 100;

const io = new Server(httpServer, {
  allowRequest: (request, callback) => callback(null, isAllowedOrigin(request)),
  maxHttpBufferSize: 20_000,
  perMessageDeflate: false,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false,
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

function enforceRateLimit(socket: PlayerSocket, limiter: RateLimiter) {
  const address = clientKey(socket.handshake.headers, socket.handshake.address);
  if (!socketEventLimiter.consume(socket.id) || !limiter.consume(address)) {
    throw new RoomError("RATE_LIMITED", "Too many requests. Wait a moment and try again.");
  }
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

io.use((socket, next) => {
  if (io.engine.clientsCount > MAX_CONNECTIONS) {
    next(new Error("The server is at connection capacity."));
    return;
  }
  const address = clientKey(socket.handshake.headers, socket.handshake.address);
  next(connectionLimiter.consume(address) ? undefined : new Error("Too many connection attempts."));
});

io.on("connection", (rawSocket) => {
  const socket = rawSocket as PlayerSocket;

  socket.on("create_room", (raw, ack: (result: Ack<{ identity: RoomIdentity; snapshot: RoomSnapshot }>) => void) => {
    guard(ack, () => {
      enforceRateLimit(socket, createRoomLimiter);
      if (rooms.getBinding(socket.id)) throw new RoomError("ALREADY_IN_ROOM", "This connection is already in a room.");
      const { name } = createRoomSchema.parse(raw);
      const result = rooms.createRoom(name, socket.id);
      void attach(socket, result);
      return { identity: result.identity, snapshot: result.snapshot };
    });
  });

  socket.on("join_room", (raw, ack: (result: Ack<{ identity: RoomIdentity; snapshot: RoomSnapshot }>) => void) => {
    guard(ack, () => {
      enforceRateLimit(socket, roomAccessLimiter);
      if (rooms.getBinding(socket.id)) throw new RoomError("ALREADY_IN_ROOM", "This connection is already in a room.");
      const { code, name } = joinRoomSchema.parse(raw);
      const result = rooms.joinRoom(code, name, socket.id);
      void attach(socket, result);
      return { identity: result.identity, snapshot: result.snapshot };
    });
  });

  socket.on("resume_room", (raw, ack: (result: Ack<{ identity: RoomIdentity; snapshot: RoomSnapshot }>) => void) => {
    guard(ack, () => {
      enforceRateLimit(socket, roomAccessLimiter);
      const { code, reconnectToken } = resumeRoomSchema.parse(raw);
      const result = rooms.resumeRoom(code, reconnectToken, socket.id);
      void attach(socket, result);
      return { identity: result.identity, snapshot: result.snapshot };
    });
  });

  socket.on("start_game", (raw, ack: (result: Ack) => void) => {
    guard(ack, () => {
      enforceRateLimit(socket, commandLimiter);
      const { commandId } = commandSchema.parse(raw);
      const identity = requireIdentity(socket);
      const snapshot = rooms.startGame(identity.roomCode, identity.playerId, socket.id, commandId);
      emitSnapshot(snapshot);
      return undefined;
    });
  });

  socket.on("roll_die", (raw, ack: (result: Ack) => void) => {
    guard(ack, () => {
      enforceRateLimit(socket, commandLimiter);
      const { commandId } = commandSchema.parse(raw);
      const identity = requireIdentity(socket);
      const snapshot = rooms.roll(identity.roomCode, identity.playerId, socket.id, commandId);
      emitSnapshot(snapshot);
      return undefined;
    });
  });

  socket.on("move_token", (raw, ack: (result: Ack) => void) => {
    guard(ack, () => {
      enforceRateLimit(socket, commandLimiter);
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

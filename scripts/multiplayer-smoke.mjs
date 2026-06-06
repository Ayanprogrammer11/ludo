import assert from "node:assert/strict";
import { io } from "socket.io-client";

const url = process.env.LUDO_URL ?? "http://localhost:3000";

function connect() {
  return new Promise((resolve, reject) => {
    const socket = io(url, { forceNew: true, timeout: 5_000 });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
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

const health = await fetch(`${url}/api/health`).then((response) => response.json());
assert.equal(health.ok, true);

const host = await connect();
const guest = await connect();
const created = await emit(host, "create_room", { name: "Ada" });
assert.equal(created.ok, true);
assert.equal(created.snapshot.players.length, 1);

const joined = await emit(guest, "join_room", { code: created.identity.roomCode, name: "Linus" });
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
const resumedGuest = await connect();
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

"use client";

import { Check, Copy, LoaderCircle, LogIn, Play, Radio, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { legalTokenIds } from "@/lib/game/engine";
import type { PlayerColor } from "@/lib/game/types";
import {
  clearRoomIdentity,
  emitAck,
  getRealtimeSocket,
  loadRoomIdentity,
  saveRoomIdentity,
} from "@/lib/realtime/client";
import type { RoomIdentity, RoomSnapshot } from "@/lib/realtime/types";
import { Die } from "./die";
import { GameBoard } from "./game-board";

const colorClass: Record<PlayerColor, string> = {
  red: "is-red",
  green: "is-green",
  yellow: "is-yellow",
  blue: "is-blue",
};

export function RoomGame({ code }: { code: string }) {
  const [identity, setIdentity] = useState<RoomIdentity | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting" | "failed">("connecting");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const socket = getRealtimeSocket();
    let disposed = false;
    let activeReconnectToken: string | null = null;

    const resume = async () => {
      const stored = loadRoomIdentity(code);
      if (!stored) {
        setConnection("connected");
        setCheckingSession(false);
        return;
      }
      const result = await emitAck<{ identity: RoomIdentity; snapshot: RoomSnapshot }>("resume_room", {
        code,
        reconnectToken: stored.reconnectToken,
      });
      if (disposed) return;
      if (!result.ok) {
        clearRoomIdentity(code, stored.reconnectToken);
        setIdentity(null);
        setConnection("failed");
        setError(result.error.message);
        setCheckingSession(false);
        return;
      }
      activeReconnectToken = result.identity.reconnectToken;
      saveRoomIdentity(result.identity);
      setIdentity(result.identity);
      setRoom(result.snapshot);
      setConnection("connected");
      setCheckingSession(false);
    };
    const onConnect = () => void resume();
    const onDisconnect = () => setConnection("reconnecting");
    const onState = (snapshot: RoomSnapshot) => setRoom(snapshot);
    const onReplaced = () => {
      if (activeReconnectToken) clearRoomIdentity(code, activeReconnectToken);
      setIdentity(null);
      setConnection("failed");
      setError("This room was opened from another device, so this tab was signed out.");
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onDisconnect);
    socket.on("room_state", onState);
    socket.on("session_replaced", onReplaced);
    if (socket.connected) void resume();
    else socket.connect();

    return () => {
      disposed = true;
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onDisconnect);
      socket.off("room_state", onState);
      socket.off("session_replaced", onReplaced);
    };
  }, [code]);

  async function join() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    const result = await emitAck<{ identity: RoomIdentity; snapshot: RoomSnapshot }>("join_room", { code, name });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    saveRoomIdentity(result.identity);
    setIdentity(result.identity);
    setRoom(result.snapshot);
  }

  async function command(event: "start_game" | "roll_die" | "move_token", extra: object = {}) {
    setBusy(true);
    setError("");
    const result = await emitAck(event, { commandId: crypto.randomUUID(), ...extra });
    setBusy(false);
    if (!result.ok) setError(result.error.message);
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (checkingSession) {
    return <RoomLoading code={code} connection={connection} />;
  }

  if (!identity) {
    return (
      <section className="room-entry">
        <span className="eyebrow">You&apos;ve been invited</span>
        <h1>Join table <em>{code}</em></h1>
        <p>Choose the name your friends will see during the match.</p>
        <label><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} autoFocus placeholder="Your name" /></label>
        <button className="primary-action" type="button" onClick={() => void join()} disabled={busy || connection === "connecting"}>
          {busy || connection === "connecting" ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />} Join the table
        </button>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </section>
    );
  }

  if (!room) {
    return <RoomLoading code={code} connection={connection} />;
  }

  if (!room.game) {
    const me = room.players.find((player) => player.id === identity.playerId);
    return (
      <section className="waiting-room">
        <div className="waiting-heading">
          <div><span className="eyebrow">Private online room</span><h1>Gather your players.</h1></div>
          <button className="code-button" type="button" onClick={() => void copyCode()}>{copied ? <Check size={15} /> : <Copy size={15} />} {code}</button>
        </div>
        <div className="waiting-grid">
          <div className="waiting-seats">
            {Array.from({ length: 4 }, (_, index) => {
              const player = room.players[index];
              const color = (player?.color ?? ["red", "green", "yellow", "blue"][index]) as PlayerColor;
              return player ? (
                <div className="waiting-player" key={player.id}>
                  <span className={`avatar ${colorClass[color]}`}>{player.name.charAt(0)}</span>
                  <div><strong>{player.name}</strong><small>{player.isHost ? "Host" : "Ready"} · {player.connected ? "Online" : "Reconnecting"}</small></div>
                  <i className={`connection-dot ${player.connected ? "online" : ""}`} />
                </div>
              ) : <div className="empty-seat" key={color}><span className={colorClass[color]} /><p>Waiting for player...</p></div>;
            })}
          </div>
          <aside className="invite-card">
            <Radio size={22} />
            <h2>Invite your friends</h2>
            <p>Share this six-character room code. The match remains private and reconnects automatically.</p>
            <button className="secondary-action" type="button" onClick={() => void copyCode()}>{copied ? "Copied" : `Copy ${code}`}</button>
            {me?.isHost ? (
              <button className="primary-action" type="button" disabled={busy || room.players.length < 2 || room.players.some((player) => !player.connected)} onClick={() => void command("start_game")}>
                <Play size={16} /> Start match
              </button>
            ) : <small>The host will start when everyone is ready.</small>}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
          </aside>
        </div>
      </section>
    );
  }

  const game = room.game;
  const me = game.players.find((player) => player.id === identity.playerId);
  const current = game.players.find((player) => player.id === game.currentPlayerId)!;
  const myTurn = me?.id === current.id;
  const legalIds = myTurn && game.phase === "awaiting_move" ? legalTokenIds(game) : [];

  return (
    <section className="game-table room-table" aria-label={`Online Ludo room ${code}`}>
      <div className="game-topbar">
        <div><span className="eyebrow">Online room · {code}</span><h2>{myTurn ? "Your turn" : `${current.name}'s turn`}</h2></div>
        <div className={`network-status ${connection === "connected" ? "online" : ""}`}>{connection === "connected" ? <Radio size={13} /> : <WifiOff size={13} />}{connection}</div>
        <button className="icon-button" type="button" onClick={() => void copyCode()} aria-label="Copy invite code">{copied ? <Check size={17} /> : <Copy size={17} />}</button>
      </div>
      <div className="game-layout">
        <div className="board-column">
          <GameBoard state={game} legalIds={legalIds} onMove={(tokenId) => void command("move_token", { tokenId })} />
          <div className="mobile-controls"><OnlineTurnControl game={game} meId={identity.playerId} busy={busy} onRoll={() => void command("roll_die")} /></div>
        </div>
        <aside className="game-panel">
          <OnlineTurnControl game={game} meId={identity.playerId} busy={busy} onRoll={() => void command("roll_die")} />
          <div className="players-list">
            <div className="panel-heading"><span>Players</span><small>{room.players.filter((player) => player.connected).length}/{room.players.length} online</small></div>
            {game.players.map((player) => <OnlinePlayerRow key={player.id} game={game} player={player} active={player.id === current.id} />)}
          </div>
          <div className="event-log" aria-live="polite">
            <div className="panel-heading"><span>Match feed</span><Radio size={13} /></div>
            {game.events.slice(0, 5).map((event) => <p key={event.id}><span className={`player-dot ${colorClass[event.color]}`} />{event.message}</p>)}
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </aside>
      </div>
    </section>
  );
}

function OnlineTurnControl({ game, meId, busy, onRoll }: { game: NonNullable<RoomSnapshot["game"]>; meId: string; busy: boolean; onRoll: () => void }) {
  const current = game.players.find((player) => player.id === game.currentPlayerId)!;
  const myTurn = current.id === meId;
  return (
    <div className={`turn-card ${colorClass[current.color]}`}>
      <div className="turn-copy"><span>{myTurn ? "Your move" : `${current.name}'s move`}</span><strong>{myTurn ? game.phase === "awaiting_roll" ? "Roll the die" : "Choose a glowing token" : "Watching their turn"}</strong></div>
      <button type="button" className="roll-button" onClick={onRoll} disabled={!myTurn || game.phase !== "awaiting_roll" || busy}>
        <Die value={game.lastRoll ?? 6} rolling={busy && myTurn} /><span>{game.phase === "awaiting_roll" ? "Roll" : `Rolled ${game.dieValue}`}</span>
      </button>
    </div>
  );
}

function OnlinePlayerRow({ game, player, active }: { game: NonNullable<RoomSnapshot["game"]>; player: NonNullable<RoomSnapshot["game"]>["players"][number]; active: boolean }) {
  const finished = game.tokens.filter((token) => token.color === player.color && token.progress === 57).length;
  return (
    <div className={`player-row ${active ? "is-active" : ""}`}>
      <span className={`avatar ${colorClass[player.color]}`}>{player.name.charAt(0)}</span>
      <span className="player-name"><strong>{player.name}</strong><small>{player.connected ? `${finished}/4 home` : "Reconnecting..."}</small></span>
      <i className={`connection-dot ${player.connected ? "online" : ""}`} />
    </div>
  );
}

function RoomLoading({ code, connection }: { code: string; connection: string }) {
  return <section className="room-loading"><LoaderCircle className="spin" size={28} /><span className="eyebrow">Room {code}</span><h1>Rejoining your table...</h1><p>{connection === "reconnecting" ? "Your connection dropped. We are keeping your seat warm." : "Securely restoring the latest match state."}</p></section>;
}

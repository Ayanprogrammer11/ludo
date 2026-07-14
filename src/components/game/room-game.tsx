"use client";

import { Check, Copy, LoaderCircle, LogIn, LogOut, Play, Radio, Trophy, UserRound, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { RouteLoading } from "@/components/loading/route-loading";
import { legalDiceIndexes, legalTokenIds } from "@/lib/game/engine";
import type { GameRules } from "@/lib/game/types";
import type { PlayerColor } from "@/lib/game/types";
import {
  clearRoomIdentity,
  emitAck,
  getRealtimeSocket,
  loadRoomIdentity,
  saveRoomIdentity,
} from "@/lib/realtime/client";
import type { RoomIdentity, RoomSnapshot } from "@/lib/realtime/types";
import { DiceControl } from "./dice-control";
import { GameBoard } from "./game-board";
import { RulePicker, RulesDisclosure } from "./rule-picker";

const colorClass: Record<PlayerColor, string> = {
  red: "is-red",
  green: "is-green",
  yellow: "is-yellow",
  blue: "is-blue",
};
const MAX_MISSED_TURNS = 3;

function formatTimer(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString();
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function RoomGame({ code, user }: { code: string; user: { displayName: string } }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<RoomIdentity | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting" | "failed">("connecting");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [piecesMoving, setPiecesMoving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [selectedDieIndex, setSelectedDieIndex] = useState<number | null>(null);

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
        setConnection(socket.connected ? "connected" : "reconnecting");
        setError(result.error.code === "SESSION_EXPIRED" ? "Your previous seat expired. Join the table again to continue." : result.error.message);
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

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  async function join() {
    setBusy(true);
    setError("");
    const result = await emitAck<{ identity: RoomIdentity; snapshot: RoomSnapshot }>("join_room", { code });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    saveRoomIdentity(result.identity);
    setIdentity(result.identity);
    setRoom(result.snapshot);
  }

  const command = useCallback(async (event: "start_game" | "update_rules" | "roll_die" | "move_token", extra: object = {}) => {
    setBusy(true);
    setError("");
    const result = await emitAck(event, { commandId: crypto.randomUUID(), ...extra });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    return true;
  }, []);

  const handleMove = useCallback(async (tokenId: string) => {
    const game = room?.game;
    const legalIndexes = game ? legalDiceIndexes(game) : [];
    const effectiveIndex = selectedDieIndex !== null && legalIndexes.includes(selectedDieIndex)
      ? selectedDieIndex
      : legalIndexes[0];
    const dieValue = effectiveIndex === undefined ? undefined : game?.pendingDice[effectiveIndex];
    if (!dieValue) {
      setError("Choose a die before moving a piece.");
      return;
    }
    setPiecesMoving(true);
    const succeeded = await command("move_token", { tokenId, dieValue });
    if (!succeeded) setPiecesMoving(false);
  }, [command, room?.game, selectedDieIndex]);

  const updateRules = useCallback((rules: GameRules) => {
    void command("update_rules", { rules });
  }, [command]);

  async function leaveRoom() {
    if (!identity) return;
    setBusy(true);
    setLeaving(true);
    setError("");
    const result = await emitAck("leave_room", { commandId: crypto.randomUUID() });
    if (!result.ok) {
      setBusy(false);
      setLeaving(false);
      setError(result.error.message);
      return;
    }
    clearRoomIdentity(code, identity.reconnectToken);
    startTransition(() => router.push("/account"));
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
        <p>You&apos;ll join this room as {user.displayName}.</p>
        <div className="signed-in-row room-account-row"><span>Signed in</span><strong><UserRound size={15} /> {user.displayName}</strong></div>
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
          <div className="waiting-main">
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
            <RulePicker rules={room.rules} isHost={Boolean(me?.isHost)} busy={busy} onChange={updateRules} />
          </div>
          <aside className="invite-card">
            <Radio size={22} />
            <h2>Invite your friends</h2>
            <p>Share this six-character room code. The match remains private and reconnects automatically.</p>
            <button className="secondary-action" type="button" onClick={() => void copyCode()}>{copied ? "Copied" : `Copy ${code}`}</button>
            {me?.isHost ? (
              <button className="primary-action" type="button" disabled={busy || room.players.length < 2 || room.players.some((player) => !player.connected)} onClick={() => void command("start_game")}>
                {busy ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />} {busy ? "Starting..." : "Start match"}
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
  const winner = game.players.find((player) => player.id === game.winnerId);
  const myTurn = me?.id === current.id;
  const legalDieIndexes = legalDiceIndexes(game);
  const effectiveDieIndex = selectedDieIndex !== null && legalDieIndexes.includes(selectedDieIndex)
    ? selectedDieIndex
    : (legalDieIndexes[0] ?? null);
  const selectedDie = effectiveDieIndex === null ? null : game.pendingDice[effectiveDieIndex] ?? null;
  const legalIds = myTurn && game.phase === "awaiting_move" && !piecesMoving && selectedDie
    ? legalTokenIds(game, selectedDie)
    : [];
  const remainingMs = room.turnDeadline && now !== null ? room.turnDeadline - now : 0;

  return (
    <section className="game-table room-table" aria-label={`Online Ludo room ${code}`}>
      <div className="game-topbar">
        <div><span className="eyebrow">Online room · {code}</span><h2>{winner ? `${winner.name} wins` : myTurn ? "Your turn" : `${current.name}'s turn`}</h2></div>
        <div className={`network-status ${connection === "connected" ? "online" : ""}`}>{connection === "connected" ? <Radio size={13} /> : <WifiOff size={13} />}{connection}</div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={() => void copyCode()} aria-label="Copy invite code" title="Copy invite code">{copied ? <Check size={17} /> : <Copy size={17} />}</button>
          <button className="icon-button" type="button" onClick={() => void leaveRoom()} disabled={busy || leaving || piecesMoving} aria-label={leaving ? "Leaving room" : "Leave room"} title={leaving ? "Leaving room" : "Leave room"}>{leaving ? <LoaderCircle className="spin" size={17} /> : <LogOut size={17} />}</button>
        </div>
      </div>
      <div className="game-layout">
        <div className="board-column">
          <GameBoard state={game} legalIds={legalIds} activeColor={current.color} interactionLocked={piecesMoving} onAnimationStateChange={setPiecesMoving} onMove={handleMove} />
          <div className="mobile-controls">
            <OnlineTurnControl game={game} meId={identity.playerId} busy={busy} piecesMoving={piecesMoving} selectedDieIndex={effectiveDieIndex} onSelectDie={setSelectedDieIndex} remainingMs={remainingMs} onRoll={() => void command("roll_die")} />
            <RulesDisclosure rules={game.rules} />
          </div>
        </div>
        <aside className="game-panel">
          <OnlineTurnControl game={game} meId={identity.playerId} busy={busy} piecesMoving={piecesMoving} selectedDieIndex={effectiveDieIndex} onSelectDie={setSelectedDieIndex} remainingMs={remainingMs} onRoll={() => void command("roll_die")} />
          <div className="players-list">
            <div className="panel-heading"><span>Players</span><small>{room.players.filter((player) => player.connected).length}/{room.players.length} online</small></div>
            {game.players.map((player) => (
              <OnlinePlayerRow
                key={player.id}
                game={game}
                player={player}
                roomPlayer={room.players.find((candidate) => candidate.id === player.id)}
                active={player.id === current.id}
              />
            ))}
          </div>
          <RulesDisclosure rules={game.rules} />
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

function OnlineTurnControl({ game, meId, busy, piecesMoving, selectedDieIndex, onSelectDie, remainingMs, onRoll }: {
  game: NonNullable<RoomSnapshot["game"]>;
  meId: string;
  busy: boolean;
  piecesMoving: boolean;
  selectedDieIndex: number | null;
  onSelectDie: (index: number) => void;
  remainingMs: number;
  onRoll: () => void;
}) {
  const current = game.players.find((player) => player.id === game.currentPlayerId)!;
  const winner = game.players.find((player) => player.id === game.winnerId);
  const myTurn = current.id === meId;
  const timerLabel = current.connected ? "left" : "grace";
  if (winner) {
    return (
      <div className={`turn-card winner-card ${colorClass[winner.color]}`}>
        <Trophy size={30} />
        <div><span>Champion</span><strong>{winner.name} wins!</strong></div>
      </div>
    );
  }
  return (
    <div className={`turn-card ${colorClass[current.color]}`}>
      <div className="turn-copy"><span>{myTurn ? "Your move" : `${current.name}'s move`}</span><strong>{piecesMoving ? "Moving piece…" : myTurn ? game.phase === "awaiting_roll" ? `Roll ${game.rules.dicePerTurn === 1 ? "the die" : `${game.rules.dicePerTurn} dice`}` : game.pendingDice.length > 1 ? "Choose a die, then a piece" : "Choose a highlighted piece" : "Watching their turn"}</strong></div>
      <div className="turn-timer" aria-label={`Turn timer ${formatTimer(remainingMs)} remaining`}><span>{formatTimer(remainingMs)}</span><small>{timerLabel}</small></div>
      <DiceControl game={game} selectedIndex={selectedDieIndex} disabled={!myTurn || busy || piecesMoving} rolling={busy && myTurn && game.phase === "awaiting_roll"} onSelect={onSelectDie} onRoll={onRoll} />
    </div>
  );
}

function OnlinePlayerRow({ game, player, roomPlayer, active }: { game: NonNullable<RoomSnapshot["game"]>; player: NonNullable<RoomSnapshot["game"]>["players"][number]; roomPlayer: RoomSnapshot["players"][number] | undefined; active: boolean }) {
  const finished = game.tokens.filter((token) => token.color === player.color && token.progress === 57).length;
  const activePieces = game.tokens.filter((token) => token.color === player.color && token.progress >= 0 && token.progress < 57).length;
  const status = player.forfeited || roomPlayer?.leftAt
    ? "Left"
    : player.connected
      ? `${finished}/4 home · ${activePieces} in play`
      : `Reconnecting · ${roomPlayer?.missedTurns ?? 0}/${MAX_MISSED_TURNS} missed`;
  return (
    <div className={`player-row ${active ? "is-active" : ""} ${player.forfeited ? "is-left" : ""}`}>
      <span className={`avatar ${colorClass[player.color]}`}>{player.name.charAt(0)}</span>
      <span className="player-name"><strong>{player.name}</strong><small>{status}</small></span>
      <i className={`connection-dot ${player.connected ? "online" : ""}`} />
    </div>
  );
}

function RoomLoading({ code, connection }: { code: string; connection: string }) {
  return (
    <RouteLoading
      eyebrow={`Room ${code}`}
      title="Rejoining your table..."
      detail={connection === "reconnecting" ? "Your connection dropped. We are keeping your seat warm." : "Securely restoring the latest match state."}
    />
  );
}

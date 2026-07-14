"use client";

import { RotateCcw, Sparkles, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { legalMovesByToken, moveToken, rollDice, skipTurn } from "@/lib/game/engine";
import type { GameState, PlayerColor } from "@/lib/game/types";
import { DiceControl } from "./dice-control";
import { GameBoard } from "./game-board";
import { RulesDisclosure } from "./rule-picker";

const colorClass: Record<PlayerColor, string> = {
  red: "is-red",
  green: "is-green",
  yellow: "is-yellow",
  blue: "is-blue",
};
const TURN_DURATION_MS = 90_000;

function formatTimer(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString();
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function LocalGame({ initialState }: { initialState: GameState }) {
  const [timedState, setTimedState] = useState(() => ({
    game: initialState,
    turnDeadline: 0,
  }));
  const [now, setNow] = useState(0);
  const [piecesMoving, setPiecesMoving] = useState(false);
  const [isRolling, startRolling] = useTransition();
  const state = timedState.game;
  const turnDeadline = timedState.turnDeadline;
  const legalMoves = useMemo(
    () => piecesMoving ? {} : legalMovesByToken(state),
    [piecesMoving, state],
  );
  const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId)!;
  const winner = state.players.find((player) => player.id === state.winnerId);
  const remainingMs = winner ? 0 : turnDeadline ? turnDeadline - now : TURN_DURATION_MS;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(performance.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (winner) return undefined;
    if (!turnDeadline) {
      const initializeTimer = window.setTimeout(() => {
        const startedAt = performance.now();
        setNow(startedAt);
        setTimedState((current) => current.turnDeadline ? current : {
          ...current,
          turnDeadline: startedAt + TURN_DURATION_MS,
        });
      }, 0);
      return () => window.clearTimeout(initializeTimer);
    }
    const timeout = window.setTimeout(() => {
      setTimedState((current) => {
        if (current.game.phase === "finished" || current.game.winnerId) return current;
        const active = current.game.players.find((player) => player.id === current.game.currentPlayerId)!;
        return {
          game: skipTurn(current.game, `${active.name}'s turn timed out`),
          turnDeadline: performance.now() + TURN_DURATION_MS,
        };
      });
    }, Math.max(0, turnDeadline - performance.now()));
    return () => window.clearTimeout(timeout);
  }, [turnDeadline, winner]);

  function handleRoll() {
    if (state.phase !== "awaiting_roll") return;
    startRolling(() => setTimedState((current) => ({
      game: rollDice(current.game),
      turnDeadline: performance.now() + TURN_DURATION_MS,
    })));
  }

  function restart() {
    setPiecesMoving(false);
    setTimedState({
      game: initialState,
      turnDeadline: performance.now() + TURN_DURATION_MS,
    });
  }

  const handleMove = useCallback((id: string, die: number) => {
    setPiecesMoving(true);
    setTimedState((current) => {
      const game = moveToken(current.game, id, die).state;
      const batchFinished = game.currentPlayerId !== current.game.currentPlayerId || game.phase === "awaiting_roll";
      return {
        game,
        turnDeadline: batchFinished ? performance.now() + TURN_DURATION_MS : current.turnDeadline,
      };
    });
  }, []);

  return (
    <section className="game-table" aria-label="Local Ludo match">
      <div className="game-topbar">
        <div><span className="eyebrow">Pass & play</span><h2>Sunday Table</h2></div>
        <div className="turn-pill">
          <span className={`player-dot ${colorClass[currentPlayer.color]}`} />
          <span><small>Turn {state.turnNumber}</small>{currentPlayer.name}</span>
        </div>
        <button type="button" className="icon-button" onClick={restart} disabled={piecesMoving} aria-label="Restart match"><RotateCcw size={18} /></button>
      </div>

      <div className="game-layout">
        <div className="board-column">
          <GameBoard
            state={state}
            legalMoves={legalMoves}
            activeColor={currentPlayer.color}
            interactionLocked={piecesMoving}
            onAnimationStateChange={setPiecesMoving}
            onMove={handleMove}
          />
          <div className="mobile-controls">
            <TurnControls state={state} currentPlayer={currentPlayer} winner={winner} isRolling={isRolling} piecesMoving={piecesMoving} remainingMs={remainingMs} onRoll={handleRoll} />
            <RulesDisclosure rules={state.rules} />
          </div>
        </div>
        <aside className="game-panel">
          <TurnControls state={state} currentPlayer={currentPlayer} winner={winner} isRolling={isRolling} piecesMoving={piecesMoving} remainingMs={remainingMs} onRoll={handleRoll} />
          <div className="players-list">
            <div className="panel-heading"><span>Players</span><small>{state.players.length}/4</small></div>
            {state.players.map((player) => {
              const finished = state.tokens.filter((token) => token.color === player.color && token.progress === 57).length;
              const active = state.tokens.filter((token) => token.color === player.color && token.progress >= 0 && token.progress < 57).length;
              return (
                <div className={`player-row ${player.id === currentPlayer.id ? "is-active" : ""}`} key={player.id}>
                  <span className={`avatar ${colorClass[player.color]}`}>{player.name.charAt(0)}</span>
                  <span className="player-name"><strong>{player.name}</strong><small>{finished === 4 ? "Finished" : `${finished}/4 home · ${active} in play`}</small></span>
                  <span className="token-mini-row" aria-hidden="true">
                    {Array.from({ length: 4 }, (_, index) => <i key={index} className={index < finished ? colorClass[player.color] : ""} />)}
                  </span>
                </div>
              );
            })}
          </div>
          <RulesDisclosure rules={state.rules} />
          <div className="event-log" aria-live="polite">
            <div className="panel-heading"><span>Match feed</span><Sparkles size={14} /></div>
            {state.events.slice(0, 4).map((item) => <p key={item.id}><span className={`player-dot ${colorClass[item.color]}`} />{item.message}</p>)}
          </div>
        </aside>
      </div>
    </section>
  );
}

function TurnControls({ state, currentPlayer, winner, isRolling, piecesMoving, remainingMs, onRoll }: {
  state: GameState;
  currentPlayer: GameState["players"][number];
  winner: GameState["players"][number] | undefined;
  isRolling: boolean;
  piecesMoving: boolean;
  remainingMs: number;
  onRoll: () => void;
}) {
  if (winner) {
    return <div className={`turn-card winner-card ${colorClass[winner.color]}`}><Trophy size={30} /><div><span>Champion</span><strong>{winner.name} wins!</strong></div></div>;
  }
  return (
    <div className={`turn-card ${colorClass[currentPlayer.color]}`}>
      <div className="turn-copy"><span>{currentPlayer.name}&apos;s move</span><strong>{piecesMoving ? "Moving piece…" : state.phase === "awaiting_roll" ? `Roll ${state.rules.dicePerTurn === 1 ? "the die" : `${state.rules.dicePerTurn} dice`}` : "Choose a piece, then a die"}</strong></div>
      <div className="turn-timer" aria-label={`Turn timer ${formatTimer(remainingMs)} remaining`}><span>{formatTimer(remainingMs)}</span><small>left</small></div>
      <DiceControl game={state} disabled={piecesMoving} rolling={isRolling} onRoll={onRoll} />
    </div>
  );
}

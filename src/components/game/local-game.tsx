"use client";

import { RotateCcw, Sparkles, Trophy } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { legalTokenIds, moveToken, rollDie } from "@/lib/game/engine";
import type { GameState, PlayerColor } from "@/lib/game/types";
import { Die } from "./die";
import { GameBoard } from "./game-board";

const colorClass: Record<PlayerColor, string> = {
  red: "is-red",
  green: "is-green",
  yellow: "is-yellow",
  blue: "is-blue",
};

export function LocalGame({ initialState }: { initialState: GameState }) {
  const [state, setState] = useState(initialState);
  const [isRolling, startRolling] = useTransition();
  const legalIds = useMemo(() => legalTokenIds(state), [state]);
  const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId)!;
  const winner = state.players.find((player) => player.id === state.winnerId);

  function handleRoll() {
    if (state.phase !== "awaiting_roll") return;
    startRolling(() => setState((current) => rollDie(current)));
  }

  return (
    <section className="game-table" aria-label="Local Ludo match">
      <div className="game-topbar">
        <div><span className="eyebrow">Pass & play</span><h2>Sunday Table</h2></div>
        <div className="turn-pill">
          <span className={`player-dot ${colorClass[currentPlayer.color]}`} />
          <span><small>Turn {state.turnNumber}</small>{currentPlayer.name}</span>
        </div>
        <button type="button" className="icon-button" onClick={() => setState(initialState)} aria-label="Restart match"><RotateCcw size={18} /></button>
      </div>

      <div className="game-layout">
        <div className="board-column">
          <GameBoard state={state} legalIds={legalIds} onMove={(id) => setState((current) => moveToken(current, id).state)} />
          <div className="mobile-controls"><TurnControls state={state} currentPlayer={currentPlayer} winner={winner} isRolling={isRolling} onRoll={handleRoll} /></div>
        </div>
        <aside className="game-panel">
          <TurnControls state={state} currentPlayer={currentPlayer} winner={winner} isRolling={isRolling} onRoll={handleRoll} />
          <div className="players-list">
            <div className="panel-heading"><span>Players</span><small>{state.players.length}/4</small></div>
            {state.players.map((player) => {
              const finished = state.tokens.filter((token) => token.color === player.color && token.progress === 57).length;
              return (
                <div className={`player-row ${player.id === currentPlayer.id ? "is-active" : ""}`} key={player.id}>
                  <span className={`avatar ${colorClass[player.color]}`}>{player.name.charAt(0)}</span>
                  <span className="player-name"><strong>{player.name}</strong><small>{finished === 4 ? "Finished" : `${finished}/4 home`}</small></span>
                  <span className="token-mini-row" aria-hidden="true">
                    {Array.from({ length: 4 }, (_, index) => <i key={index} className={index < finished ? colorClass[player.color] : ""} />)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="event-log" aria-live="polite">
            <div className="panel-heading"><span>Match feed</span><Sparkles size={14} /></div>
            {state.events.slice(0, 4).map((item) => <p key={item.id}><span className={`player-dot ${colorClass[item.color]}`} />{item.message}</p>)}
          </div>
        </aside>
      </div>
    </section>
  );
}

function TurnControls({ state, currentPlayer, winner, isRolling, onRoll }: {
  state: GameState;
  currentPlayer: GameState["players"][number];
  winner: GameState["players"][number] | undefined;
  isRolling: boolean;
  onRoll: () => void;
}) {
  if (winner) {
    return <div className={`turn-card winner-card ${colorClass[winner.color]}`}><Trophy size={30} /><div><span>Champion</span><strong>{winner.name} wins!</strong></div></div>;
  }
  return (
    <div className={`turn-card ${colorClass[currentPlayer.color]}`}>
      <div className="turn-copy"><span>{currentPlayer.name}&apos;s move</span><strong>{state.phase === "awaiting_roll" ? "Roll the die" : "Choose a glowing token"}</strong></div>
      <button type="button" className="roll-button" onClick={onRoll} disabled={state.phase !== "awaiting_roll" || isRolling}>
        <Die value={state.lastRoll ?? 6} rolling={isRolling} />
        <span>{state.phase === "awaiting_roll" ? "Roll" : `Rolled ${state.dieValue}`}</span>
      </button>
    </div>
  );
}

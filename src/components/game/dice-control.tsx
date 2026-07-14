"use client";

import { legalDiceIndexes } from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import { Die } from "./die";

export function DiceControl({ game, disabled, rolling, onRoll }: {
  game: GameState;
  disabled: boolean;
  rolling: boolean;
  onRoll: () => void;
}) {
  if (game.phase === "awaiting_roll") {
    const count = game.rules?.dicePerTurn ?? 1;
    const previews = game.lastRolls?.length === count
      ? game.lastRolls
      : Array.from({ length: count }, () => 6);
    return (
      <button type="button" className="roll-button dice-roll-button" onClick={onRoll} disabled={disabled || rolling}>
        <span className="dice-preview" aria-hidden="true">
          {previews.map((value, index) => <Die key={index} value={value} compact rolling={rolling} />)}
        </span>
        <span>{rolling ? "Rolling…" : `Roll ${count} ${count === 1 ? "die" : "dice"}`}</span>
      </button>
    );
  }

  const legalIndexes = new Set(legalDiceIndexes(game));
  return (
    <div className="dice-spend" aria-label="Dice remaining this turn">
      <span className="dice-spend-label">Dice left · choose a piece</span>
      <div>
        {(game.pendingDice ?? []).map((value, index) => (
          <span
            key={`${value}-${index}`}
            className={!legalIndexes.has(index) || disabled ? "is-unavailable" : ""}
            aria-label={`Die ${index + 1}, showing ${value}${legalIndexes.has(index) ? "" : ", no legal move"}`}
          >
            <Die value={value} compact />
          </span>
        ))}
      </div>
      {game.bonusRollPending ? <small>Bonus roll queued</small> : null}
    </div>
  );
}

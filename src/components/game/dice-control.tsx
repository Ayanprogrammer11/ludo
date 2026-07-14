"use client";

import { legalDiceIndexes } from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import { Die } from "./die";

export function DiceControl({ game, selectedIndex, disabled, rolling, onSelect, onRoll }: {
  game: GameState;
  selectedIndex: number | null;
  disabled: boolean;
  rolling: boolean;
  onSelect: (index: number) => void;
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
    <div className="dice-spend" aria-label="Choose a die to spend">
      <span className="dice-spend-label">Choose die</span>
      <div>
        {(game.pendingDice ?? []).map((value, index) => (
          <button
            key={`${value}-${index}`}
            type="button"
            className={selectedIndex === index ? "is-selected" : ""}
            disabled={disabled || !legalIndexes.has(index)}
            aria-label={`Use die ${index + 1}, showing ${value}`}
            aria-pressed={selectedIndex === index}
            onClick={() => onSelect(index)}
          >
            <Die value={value} compact />
          </button>
        ))}
      </div>
      {game.bonusRollPending ? <small>Bonus roll queued</small> : null}
    </div>
  );
}

"use client";

import { Check, Dices, Gauge, House, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import {
  RULE_GROUPS,
  RULE_PRESETS,
  activeRuleLabels,
  matchingPreset,
  normalizeGameRules,
  type RulePresetId,
  type ToggleRuleKey,
} from "@/lib/game/rules";
import type { GameRules } from "@/lib/game/types";

const presetIcons = {
  classic: House,
  quick: Gauge,
  strategic: ShieldCheck,
} satisfies Record<RulePresetId, typeof House>;

function diceLabel(count: number) {
  return `${count} ${count === 1 ? "die" : "dice"}`;
}

export function RulePicker({ rules, isHost, busy, onChange }: {
  rules: GameRules;
  isHost: boolean;
  busy: boolean;
  onChange: (rules: GameRules) => void;
}) {
  const normalized = normalizeGameRules(rules);
  const selectedPreset = matchingPreset(normalized);

  if (!isHost) {
    return (
      <section className="rule-picker rule-picker-readonly" aria-label="Rules selected by the host">
        <div className="rule-picker-heading">
          <span className="rule-picker-icon"><SlidersHorizontal size={17} /></span>
          <div>
            <h2>{selectedPreset ? RULE_PRESETS[selectedPreset].name : "Custom rules"}</h2>
            <p>The host has chosen {diceLabel(normalized.dicePerTurn)} per turn.</p>
          </div>
        </div>
        <div className="rule-chip-list">
          {activeRuleLabels(normalized).map((label) => <span key={label}>{label}</span>)}
        </div>
        <p className="rules-off-count">{RULE_GROUPS.flatMap((group) => group.rules).filter((rule) => !normalized[rule.key]).length} optional rules are off.</p>
      </section>
    );
  }

  function choosePreset(id: RulePresetId) {
    onChange(normalizeGameRules(RULE_PRESETS[id].rules));
  }

  function toggleRule(key: ToggleRuleKey) {
    onChange(normalizeGameRules({ ...normalized, [key]: !normalized[key] }));
  }

  return (
    <section className="rule-picker" aria-label="Choose match rules">
      <div className="rule-picker-heading">
        <span className="rule-picker-icon"><SlidersHorizontal size={17} /></span>
        <div>
          <h2>Choose your table rules</h2>
          <p>Pick a starting point, then settle the house rules before play.</p>
        </div>
      </div>

      <div className="rule-presets" aria-label="Rule presets">
        {(Object.entries(RULE_PRESETS) as Array<[RulePresetId, (typeof RULE_PRESETS)[RulePresetId]]>).map(([id, preset]) => {
          const Icon = presetIcons[id];
          return (
            <button
              key={id}
              type="button"
              className={selectedPreset === id ? "is-selected" : ""}
              aria-pressed={selectedPreset === id}
              disabled={busy}
              onClick={() => choosePreset(id)}
            >
              <Icon size={16} />
              <span><strong>{preset.name}</strong><small>{preset.description}</small></span>
              {selectedPreset === id ? <Check size={15} /> : null}
            </button>
          );
        })}
      </div>

      <fieldset className="dice-count-field" disabled={busy}>
        <legend><Dices size={16} /> Dice per turn</legend>
        <p>Roll together, then spend each die on the same or different pieces.</p>
        <div className="dice-count-options">
          {([1, 2, 3, 4] as const).map((count) => (
            <button
              key={count}
              type="button"
              className={normalized.dicePerTurn === count ? "is-selected" : ""}
              aria-pressed={normalized.dicePerTurn === count}
              onClick={() => onChange({ ...normalized, dicePerTurn: count })}
            >
              {count}<span>{count === 1 ? "die" : "dice"}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <details className="custom-rules">
        <summary>
          <span>Customize individual rules</span>
          <small>{activeRuleLabels(normalized).length} active</small>
        </summary>
        <div className="rule-groups">
          {RULE_GROUPS.map((group) => (
            <fieldset key={group.name}>
              <legend>{group.name}</legend>
              {group.rules.map((rule) => {
                const dependencyDisabled = (rule.key === "threeEntryAttempts" && !normalized.mustRollSixToEnter)
                  || (rule.key === "threeSixesLoseTurn" && !normalized.bonusRollOnSix);
                return (
                  <button
                    key={rule.key}
                    type="button"
                    className="rule-switch"
                    role="switch"
                    aria-checked={normalized[rule.key]}
                    disabled={busy || dependencyDisabled}
                    onClick={() => toggleRule(rule.key)}
                  >
                    <span><strong>{rule.label}</strong><small>{rule.description}</small></span>
                    <i aria-hidden="true"><b /></i>
                  </button>
                );
              })}
            </fieldset>
          ))}
        </div>
      </details>
    </section>
  );
}

export function RulesDisclosure({ rules }: { rules?: GameRules | null }) {
  const normalized = normalizeGameRules(rules);
  const preset = matchingPreset(normalized);
  return (
    <details className="active-rules">
      <summary>
        <span><SlidersHorizontal size={14} /> Match rules</span>
        <small>{diceLabel(normalized.dicePerTurn)} · {preset ? RULE_PRESETS[preset].name : "Custom"}</small>
      </summary>
      <div className="rule-status-list">
        {RULE_GROUPS.flatMap((group) => group.rules).map((rule) => (
          <span key={rule.key} className={normalized[rule.key] ? "is-on" : "is-off"}>
            {normalized[rule.key] ? <Check size={11} /> : <X size={11} />}{rule.label}
          </span>
        ))}
      </div>
    </details>
  );
}

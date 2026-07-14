import type { GameRules } from "./types";

export const DEFAULT_GAME_RULES: GameRules = {
  dicePerTurn: 1,
  mustRollSixToEnter: true,
  threeEntryAttempts: false,
  bonusRollOnSix: true,
  threeSixesLoseTurn: false,
  bonusRollOnCapture: true,
  bonusRollOnHome: true,
  safeSquares: true,
  blockades: true,
  captureBeforeHome: true,
  exactRollToFinish: true,
};

export const RULE_PRESETS = {
  classic: {
    name: "House classic",
    description: "The familiar table game, with bonus turns and tactical blocks.",
    rules: DEFAULT_GAME_RULES,
  },
  quick: {
    name: "Fast table",
    description: "Open quickly, keep pieces flowing, and accept an over-roll at home.",
    rules: {
      dicePerTurn: 2,
      mustRollSixToEnter: false,
      threeEntryAttempts: false,
      bonusRollOnSix: true,
      threeSixesLoseTurn: false,
      bonusRollOnCapture: true,
      bonusRollOnHome: true,
      safeSquares: true,
      blockades: false,
      captureBeforeHome: false,
      exactRollToFinish: false,
    },
  },
  strategic: {
    name: "Strategic table",
    description: "A stricter race where captures unlock home and bonus turns are scarce.",
    rules: {
      dicePerTurn: 1,
      mustRollSixToEnter: true,
      threeEntryAttempts: true,
      bonusRollOnSix: true,
      threeSixesLoseTurn: true,
      bonusRollOnCapture: false,
      bonusRollOnHome: false,
      safeSquares: true,
      blockades: true,
      captureBeforeHome: true,
      exactRollToFinish: true,
    },
  },
} as const satisfies Record<string, { name: string; description: string; rules: GameRules }>;

export type RulePresetId = keyof typeof RULE_PRESETS;
export type GameRuleKey = keyof GameRules;
export type ToggleRuleKey = Exclude<GameRuleKey, "dicePerTurn">;

export const RULE_GROUPS: Array<{
  name: string;
  rules: Array<{ key: ToggleRuleKey; label: string; description: string }>;
}> = [
  {
    name: "Leaving the yard",
    rules: [
      {
        key: "mustRollSixToEnter",
        label: "Need a 6 to enter",
        description: "When off, any roll can place a yard piece on its starting square.",
      },
      {
        key: "threeEntryAttempts",
        label: "Three tries when stuck in the yard",
        description: "With no piece in play, roll up to three times to find a 6.",
      },
    ],
  },
  {
    name: "Bonus turns",
    rules: [
      {
        key: "bonusRollOnSix",
        label: "Extra roll after a 6",
        description: "Keep the turn after using a roll of 6.",
      },
      {
        key: "threeSixesLoseTurn",
        label: "Third 6 ends the turn",
        description: "A third consecutive 6 cannot be used and passes play onward.",
      },
      {
        key: "bonusRollOnCapture",
        label: "Extra roll after a capture",
        description: "Reward sending an opponent back to their yard.",
      },
      {
        key: "bonusRollOnHome",
        label: "Extra roll after reaching home",
        description: "Reward bringing one piece onto its final home square.",
      },
    ],
  },
  {
    name: "Board tactics",
    rules: [
      {
        key: "safeSquares",
        label: "Protected safe squares",
        description: "Pieces on stars and coloured starting squares cannot be captured.",
      },
      {
        key: "blockades",
        label: "Two pieces form a blockade",
        description: "Opponents cannot land on or pass two same-colour pieces.",
      },
      {
        key: "captureBeforeHome",
        label: "Capture before entering home",
        description: "Pieces keep circling the outer track until that player captures once.",
      },
    ],
  },
  {
    name: "Finishing",
    rules: [
      {
        key: "exactRollToFinish",
        label: "Exact roll to finish",
        description: "When off, a roll larger than the remaining distance still finishes the piece.",
      },
    ],
  },
];

export function normalizeGameRules(input?: Partial<GameRules> | null): GameRules {
  const rules = { ...DEFAULT_GAME_RULES, ...input };
  if (![1, 2, 3, 4].includes(rules.dicePerTurn)) rules.dicePerTurn = 1;
  if (!rules.mustRollSixToEnter) rules.threeEntryAttempts = false;
  if (!rules.bonusRollOnSix) rules.threeSixesLoseTurn = false;
  return rules;
}

export function matchingPreset(rules: GameRules): RulePresetId | null {
  const entries = Object.entries(RULE_PRESETS) as Array<[RulePresetId, (typeof RULE_PRESETS)[RulePresetId]]>;
  return entries.find(([, preset]) =>
    (Object.keys(preset.rules) as GameRuleKey[]).every((key) => preset.rules[key] === rules[key]),
  )?.[0] ?? null;
}

export function activeRuleLabels(rules: GameRules): string[] {
  return RULE_GROUPS.flatMap((group) => group.rules)
    .filter((rule) => rules[rule.key])
    .map((rule) => rule.label);
}

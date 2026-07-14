export const PLAYER_COLORS = ["red", "green", "yellow", "blue"] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number];

export type GameRules = {
  dicePerTurn: 1 | 2 | 3 | 4;
  mustRollSixToEnter: boolean;
  threeEntryAttempts: boolean;
  bonusRollOnSix: boolean;
  threeSixesLoseTurn: boolean;
  bonusRollOnCapture: boolean;
  bonusRollOnHome: boolean;
  safeSquares: boolean;
  blockades: boolean;
  captureBeforeHome: boolean;
  exactRollToFinish: boolean;
};

export type GamePhase = "awaiting_roll" | "awaiting_move" | "finished";

export type Player = {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  forfeited: boolean;
  hasCaptured: boolean;
};

export type Token = {
  id: string;
  color: PlayerColor;
  index: number;
  progress: number;
};

export type GameEvent = {
  id: string;
  message: string;
  color: PlayerColor;
  kind: "roll" | "move" | "capture" | "finish" | "turn";
};

export type GameState = {
  id: string;
  players: Player[];
  tokens: Token[];
  currentPlayerId: string;
  phase: GamePhase;
  dieValue: number | null;
  lastRoll: number | null;
  lastRolls: number[];
  pendingDice: number[];
  bonusRollPending: boolean;
  consecutiveSixes: number;
  entryAttempts: number;
  turnNumber: number;
  winnerId: string | null;
  rules: GameRules;
  events: GameEvent[];
};

export type MoveResult = {
  state: GameState;
  capturedTokenIds: string[];
  finished: boolean;
  bonusTurn: boolean;
};

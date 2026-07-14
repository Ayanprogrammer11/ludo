import {
  SAFE_TRACK_INDEXES,
  START_INDEX,
  globalTrackIndex,
} from "./board";
import { DEFAULT_GAME_RULES, normalizeGameRules } from "./rules";
import {
  PLAYER_COLORS,
  type GameEvent,
  type GameRules,
  type GameState,
  type MoveResult,
  type Player,
  type PlayerColor,
  type Token,
} from "./types";

export const TRACK_END_PROGRESS = 51;
export const HOME_START_PROGRESS = 52;
export const FINISH_PROGRESS = 57;

function rulesFor(state: GameState): GameRules {
  return state.rules ?? DEFAULT_GAME_RULES;
}

function event(
  state: GameState,
  message: string,
  color: PlayerColor,
  kind: GameEvent["kind"],
): GameEvent[] {
  return [
    { id: crypto.randomUUID(), message, color, kind },
    ...state.events,
  ].slice(0, 8);
}

function activePlayer(state: GameState): Player {
  const player = state.players.find((candidate) => candidate.id === state.currentPlayerId);
  if (!player) throw new Error("The active player does not exist.");
  if (player.forfeited) throw new Error("A forfeited player cannot take a turn.");
  return player;
}

function nextPlayerId(state: GameState): string {
  const currentIndex = state.players.findIndex((player) => player.id === state.currentPlayerId);
  const eligiblePlayers = state.players.filter((player) => !player.forfeited);
  if (eligiblePlayers.length === 0) throw new Error("No active players remain.");
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(currentIndex + offset + state.players.length) % state.players.length];
    if (!candidate.forfeited) return candidate.id;
  }
  return eligiblePlayers[0].id;
}

function endTurn(state: GameState, message?: string): GameState {
  const player = activePlayer(state);
  return {
    ...state,
    currentPlayerId: nextPlayerId(state),
    phase: "awaiting_roll",
    dieValue: null,
    pendingDice: [],
    bonusRollPending: false,
    consecutiveSixes: 0,
    entryAttempts: 0,
    turnNumber: state.turnNumber + 1,
    events: message ? event(state, message, player.color, "turn") : state.events,
  };
}

function tokensAtTrackIndex(state: GameState, index: number): Token[] {
  return state.tokens.filter((token) => globalTrackIndex(token) === index);
}

function isOpponentBlockade(
  state: GameState,
  index: number,
  movingColor: PlayerColor,
): boolean {
  const counts = new Map<PlayerColor, number>();
  for (const token of tokensAtTrackIndex(state, index)) {
    if (token.color === movingColor) continue;
    counts.set(token.color, (counts.get(token.color) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count >= 2);
}

function destinationFor(state: GameState, token: Token, die: number): number {
  if (token.progress === -1) return 0;
  const destination = token.progress + die;
  return !rulesFor(state).exactRollToFinish && destination > FINISH_PROGRESS
    ? FINISH_PROGRESS
    : destination;
}

export function canMoveToken(state: GameState, token: Token, die: number): boolean {
  const player = activePlayer(state);
  const rules = rulesFor(state);
  if (token.color !== player.color || token.progress === FINISH_PROGRESS) return false;
  if (token.progress === -1 && rules.mustRollSixToEnter && die !== 6) return false;

  const destination = destinationFor(state, token, die);
  if (destination > FINISH_PROGRESS) return false;
  if (
    rules.captureBeforeHome
    && !player.hasCaptured
    && token.progress <= TRACK_END_PROGRESS
    && destination >= HOME_START_PROGRESS
  ) return false;

  if (!rules.blockades) return true;

  if (destination <= TRACK_END_PROGRESS) {
    const destinationIndex = (START_INDEX[token.color] + destination) % 52;
    if (isOpponentBlockade(state, destinationIndex, token.color)) return false;
  }

  const trackSteps = token.progress === -1
    ? [START_INDEX[token.color]]
    : Array.from(
      { length: Math.max(0, Math.min(die, TRACK_END_PROGRESS - token.progress)) },
      (_, offset) => (START_INDEX[token.color] + token.progress + offset + 1) % 52,
    );
  return !trackSteps.some((index) => isOpponentBlockade(state, index, token.color));
}

export function legalTokenIds(state: GameState, die = state.dieValue ?? state.pendingDice?.[0] ?? null): string[] {
  if (!die) return [];
  return state.tokens
    .filter((token) => canMoveToken(state, token, die))
    .map((token) => token.id);
}

export function legalDiceIndexes(state: GameState): number[] {
  return (state.pendingDice ?? []).flatMap((die, index) =>
    legalTokenIds(state, die).length > 0 ? [index] : [],
  );
}

export function createGame(
  names: string[],
  id = crypto.randomUUID(),
  rules: GameRules = DEFAULT_GAME_RULES,
): GameState {
  return createGameForPlayers(
    names.map((name, index) => ({
      id: `player-${index + 1}`,
      name,
      connected: true,
    })),
    id,
    rules,
  );
}

export function createGameForPlayers(
  input: Array<Pick<Player, "id" | "name"> & Partial<Pick<Player, "connected">>>,
  id = crypto.randomUUID(),
  rules: GameRules = DEFAULT_GAME_RULES,
): GameState {
  if (input.length < 2 || input.length > 4) {
    throw new Error("Ludo needs between two and four players.");
  }

  const players = input.map((player, index) => ({
    id: player.id,
    name: player.name.trim() || `Player ${index + 1}`,
    color: PLAYER_COLORS[index],
    connected: player.connected ?? true,
    forfeited: false,
    hasCaptured: false,
  }));
  const tokens = players.flatMap((player) =>
    Array.from({ length: 4 }, (_, index) => ({
      id: `${player.color}-${index}`,
      color: player.color,
      index,
      progress: -1,
    })),
  );

  return {
    id,
    players,
    tokens,
    currentPlayerId: players[0].id,
    phase: "awaiting_roll",
    dieValue: null,
    lastRoll: null,
    lastRolls: [],
    pendingDice: [],
    bonusRollPending: false,
    consecutiveSixes: 0,
    entryAttempts: 0,
    turnNumber: 1,
    winnerId: null,
    rules: normalizeGameRules(rules),
    events: [{
      id: "game-start",
      message: `${players[0].name} goes first`,
      color: players[0].color,
      kind: "turn",
    }],
  };
}

function rollLabel(values: number[]) {
  if (values.length === 1) return `${values[0]}`;
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

export function rollDice(
  state: GameState,
  values = Array.from({ length: rulesFor(state).dicePerTurn }, () => Math.floor(Math.random() * 6) + 1),
): GameState {
  if (state.phase !== "awaiting_roll" || state.winnerId) {
    throw new Error("The dice cannot be rolled right now.");
  }
  const rules = rulesFor(state);
  if (values.length !== rules.dicePerTurn) {
    throw new Error(`This table rolls ${rules.dicePerTurn} ${rules.dicePerTurn === 1 ? "die" : "dice"} per turn.`);
  }
  if (values.some((value) => !Number.isInteger(value) || value < 1 || value > 6)) {
    throw new Error("Every die roll must be an integer from one to six.");
  }

  const player = activePlayer(state);
  let consecutiveSixes = state.consecutiveSixes;
  let threeSixesRolled = false;
  for (const value of values) {
    consecutiveSixes = value === 6 ? consecutiveSixes + 1 : 0;
    if (rules.threeSixesLoseTurn && consecutiveSixes >= 3) threeSixesRolled = true;
  }
  const rolled: GameState = {
    ...state,
    dieValue: values.length === 1 ? values[0] : null,
    lastRoll: values[0],
    lastRolls: [...values],
    pendingDice: [...values],
    bonusRollPending: false,
    consecutiveSixes,
    events: event(state, `${player.name} rolled ${rollLabel(values)}`, player.color, "roll"),
  };

  if (threeSixesRolled) {
    return endTurn(rolled, `${player.name} rolled three consecutive sixes and lost the turn`);
  }

  if (!values.some((die) => legalTokenIds(rolled, die).length > 0)) {
    if (rules.bonusRollOnSix && values.includes(6)) {
      return {
        ...rolled,
        phase: "awaiting_roll",
        dieValue: null,
        pendingDice: [],
        events: event(rolled, `${player.name} has no legal move and rolls again`, player.color, "turn"),
      };
    }

    const hasNoPieceInPlay = rolled.tokens
      .filter((token) => token.color === player.color)
      .every((token) => token.progress === -1 || token.progress === FINISH_PROGRESS);
    const entryAttempts = state.entryAttempts ?? 0;
    if (
      rules.mustRollSixToEnter
      && rules.threeEntryAttempts
      && hasNoPieceInPlay
      && !values.includes(6)
      && entryAttempts < 2
    ) {
      return {
        ...rolled,
        phase: "awaiting_roll",
        dieValue: null,
        pendingDice: [],
        entryAttempts: entryAttempts + 1,
        events: event(
          rolled,
          `${player.name} can try again (${entryAttempts + 2} of 3)`,
          player.color,
          "turn",
        ),
      };
    }
    return endTurn(rolled, `${player.name} has no legal move`);
  }

  return { ...rolled, phase: "awaiting_move" };
}

export function rollDie(state: GameState, value = Math.floor(Math.random() * 6) + 1): GameState {
  return rollDice(state, [value]);
}

export function skipTurn(state: GameState, reason?: string): GameState {
  if (state.phase === "finished" || state.winnerId) {
    throw new Error("A finished game cannot skip a turn.");
  }
  const player = activePlayer(state);
  return endTurn(state, reason ?? `${player.name} skipped the turn`);
}

export function forfeitPlayer(state: GameState, playerId: string, reason?: string): GameState {
  if (state.phase === "finished" || state.winnerId) {
    throw new Error("A finished game cannot forfeit a player.");
  }
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error("That player is not in this game.");
  if (player.forfeited) return state;

  const players = state.players.map((candidate) =>
    candidate.id === playerId ? { ...candidate, connected: false, forfeited: true } : candidate,
  );
  const remaining = players.filter((candidate) => !candidate.forfeited);
  const message = reason ?? `${player.name} forfeited the match`;
  const withEvent = event({ ...state, players }, message, player.color, "turn");

  if (remaining.length === 1) {
    const winner = remaining[0];
    return {
      ...state,
      players,
      currentPlayerId: winner.id,
      phase: "finished",
      dieValue: null,
      pendingDice: [],
      bonusRollPending: false,
      winnerId: winner.id,
      events: event({ ...state, players, events: withEvent }, `${winner.name} wins by forfeit`, winner.color, "finish"),
    };
  }

  if (state.currentPlayerId !== playerId) {
    return { ...state, players, events: withEvent };
  }

  return {
    ...state,
    players,
    currentPlayerId: nextPlayerId({ ...state, players }),
    phase: "awaiting_roll",
    dieValue: null,
    pendingDice: [],
    bonusRollPending: false,
    consecutiveSixes: 0,
    entryAttempts: 0,
    turnNumber: state.turnNumber + 1,
    events: withEvent,
  };
}

function removeDie(dice: number[], value: number): number[] {
  const index = dice.indexOf(value);
  return index < 0 ? dice : [...dice.slice(0, index), ...dice.slice(index + 1)];
}

export function moveToken(state: GameState, tokenId: string, requestedDie?: number): MoveResult {
  const pendingDice = state.pendingDice?.length
    ? state.pendingDice
    : state.dieValue
      ? [state.dieValue]
      : [];
  const die = requestedDie ?? (pendingDice.length === 1 ? pendingDice[0] : state.dieValue);
  if (state.phase !== "awaiting_move" || !die || state.winnerId) {
    throw new Error("A token cannot be moved right now.");
  }
  if (!pendingDice.includes(die)) throw new Error("That die has already been used.");
  if (!legalTokenIds(state, die).includes(tokenId)) {
    throw new Error("That token cannot use the selected die.");
  }

  const rules = rulesFor(state);
  const player = activePlayer(state);
  const movingToken = state.tokens.find((token) => token.id === tokenId)!;
  const destination = destinationFor(state, movingToken, die);
  const destinationIndex = destination <= TRACK_END_PROGRESS
    ? (START_INDEX[movingToken.color] + destination) % 52
    : null;
  const captured = destinationIndex !== null && (!rules.safeSquares || !SAFE_TRACK_INDEXES.has(destinationIndex))
    ? tokensAtTrackIndex(state, destinationIndex).filter((token) => token.color !== movingToken.color)
    : [];
  const finished = destination === FINISH_PROGRESS;

  const tokens = state.tokens.map((token) => {
    if (token.id === tokenId) return { ...token, progress: destination };
    if (captured.some((candidate) => candidate.id === token.id)) return { ...token, progress: -1 };
    return token;
  });
  const players = captured.length > 0
    ? state.players.map((candidate) => candidate.id === player.id ? { ...candidate, hasCaptured: true } : candidate)
    : state.players;
  const hasWon = tokens
    .filter((token) => token.color === player.color)
    .every((token) => token.progress === FINISH_PROGRESS);
  const earnedBonus = !hasWon && (
    (die === 6 && rules.bonusRollOnSix)
    || (captured.length > 0 && rules.bonusRollOnCapture)
    || (finished && rules.bonusRollOnHome)
  );
  const bonusRollPending = Boolean(state.bonusRollPending || earnedBonus);
  const remainingDice = removeDie(pendingDice, die);
  const action = captured.length > 0
    ? `${player.name} captured ${captured.length === 1 ? "a piece" : `${captured.length} pieces`}`
    : finished
      ? `${player.name} brought a piece home`
      : `${player.name} moved a piece`;
  let next: GameState = {
    ...state,
    players,
    tokens,
    phase: hasWon ? "finished" : "awaiting_move",
    dieValue: remainingDice.length === 1 ? remainingDice[0] : null,
    pendingDice: remainingDice,
    bonusRollPending,
    entryAttempts: 0,
    winnerId: hasWon ? player.id : null,
    events: event(state, hasWon ? `${player.name} wins the game!` : action, player.color, hasWon ? "finish" : captured.length ? "capture" : "move"),
  };

  if (!hasWon && !remainingDice.some((value) => legalTokenIds(next, value).length > 0)) {
    next = bonusRollPending
      ? {
        ...next,
        phase: "awaiting_roll",
        dieValue: null,
        pendingDice: [],
        bonusRollPending: false,
      }
      : endTurn({
        ...next,
        dieValue: null,
        pendingDice: [],
        bonusRollPending: false,
      });
  }

  return {
    state: next,
    capturedTokenIds: captured.map((token) => token.id),
    finished,
    bonusTurn: bonusRollPending,
  };
}

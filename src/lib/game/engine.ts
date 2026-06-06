import {
  SAFE_TRACK_INDEXES,
  START_INDEX,
  globalTrackIndex,
} from "./board";
import {
  PLAYER_COLORS,
  type GameEvent,
  type GameState,
  type MoveResult,
  type Player,
  type PlayerColor,
  type Token,
} from "./types";

const FINISH_PROGRESS = 57;

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
  return player;
}

function nextPlayerId(state: GameState): string {
  const currentIndex = state.players.findIndex((player) => player.id === state.currentPlayerId);
  return state.players[(currentIndex + 1) % state.players.length].id;
}

function endTurn(state: GameState, message?: string): GameState {
  const player = activePlayer(state);
  return {
    ...state,
    currentPlayerId: nextPlayerId(state),
    phase: "awaiting_roll",
    dieValue: null,
    consecutiveSixes: 0,
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

export function canMoveToken(state: GameState, token: Token, die: number): boolean {
  const player = activePlayer(state);
  if (token.color !== player.color || token.progress === FINISH_PROGRESS) return false;

  const destination = token.progress === -1 ? 0 : token.progress + die;
  if (token.progress === -1 && die !== 6) return false;
  if (destination > FINISH_PROGRESS) return false;

  if (destination <= 51) {
    const destinationIndex = (START_INDEX[token.color] + destination) % 52;
    if (isOpponentBlockade(state, destinationIndex, token.color)) {
      return false;
    }

    const stepsOnTrack = token.progress === -1 ? [destinationIndex] : Array.from(
      { length: Math.min(die, 51 - token.progress) },
      (_, offset) => (START_INDEX[token.color] + token.progress + offset + 1) % 52,
    );
    if (stepsOnTrack.some((index) => isOpponentBlockade(state, index, token.color))) {
      return false;
    }
  }

  return true;
}

export function legalTokenIds(state: GameState, die = state.dieValue): string[] {
  if (!die) return [];
  return state.tokens
    .filter((token) => canMoveToken(state, token, die))
    .map((token) => token.id);
}

export function createGame(names: string[], id = crypto.randomUUID()): GameState {
  return createGameForPlayers(
    names.map((name, index) => ({
      id: `player-${index + 1}`,
      name,
      connected: true,
    })),
    id,
  );
}

export function createGameForPlayers(
  input: Array<Pick<Player, "id" | "name"> & Partial<Pick<Player, "connected">>>,
  id = crypto.randomUUID(),
): GameState {
  if (input.length < 2 || input.length > 4) {
    throw new Error("Ludo needs between two and four players.");
  }

  const players = input.map((player, index) => ({
    id: player.id,
    name: player.name.trim() || `Player ${index + 1}`,
    color: PLAYER_COLORS[index],
    connected: player.connected ?? true,
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
    consecutiveSixes: 0,
    turnNumber: 1,
    winnerId: null,
    events: [{
      id: "game-start",
      message: `${players[0].name} goes first`,
      color: players[0].color,
      kind: "turn",
    }],
  };
}

export function rollDie(state: GameState, value = Math.floor(Math.random() * 6) + 1): GameState {
  if (state.phase !== "awaiting_roll" || state.winnerId) {
    throw new Error("The die cannot be rolled right now.");
  }
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    throw new Error("A die roll must be an integer from one to six.");
  }

  const player = activePlayer(state);
  const consecutiveSixes = value === 6 ? state.consecutiveSixes + 1 : 0;
  const rolled: GameState = {
    ...state,
    dieValue: value,
    lastRoll: value,
    consecutiveSixes,
    events: event(state, `${player.name} rolled ${value}`, player.color, "roll"),
  };

  if (consecutiveSixes === 3) {
    return endTurn(rolled, `${player.name} rolled three sixes and lost the turn`);
  }

  if (legalTokenIds(rolled, value).length === 0) {
    if (value === 6) {
      return {
        ...rolled,
        phase: "awaiting_roll",
        dieValue: null,
        events: event(rolled, `${player.name} has no legal move and rolls again`, player.color, "turn"),
      };
    }
    return endTurn(rolled, `${player.name} has no legal move`);
  }

  return { ...rolled, phase: "awaiting_move" };
}

export function skipTurn(state: GameState, reason?: string): GameState {
  if (state.phase === "finished" || state.winnerId) {
    throw new Error("A finished game cannot skip a turn.");
  }
  const player = activePlayer(state);
  return endTurn(state, reason ?? `${player.name} skipped the turn`);
}

export function moveToken(state: GameState, tokenId: string): MoveResult {
  if (state.phase !== "awaiting_move" || !state.dieValue || state.winnerId) {
    throw new Error("A token cannot be moved right now.");
  }
  if (!legalTokenIds(state).includes(tokenId)) {
    throw new Error("That token cannot make this move.");
  }

  const player = activePlayer(state);
  const movingToken = state.tokens.find((token) => token.id === tokenId)!;
  const destination = movingToken.progress === -1 ? 0 : movingToken.progress + state.dieValue;
  const destinationIndex = destination <= 51
    ? (START_INDEX[movingToken.color] + destination) % 52
    : null;
  const captured = destinationIndex !== null && !SAFE_TRACK_INDEXES.has(destinationIndex)
    ? tokensAtTrackIndex(state, destinationIndex).filter((token) => token.color !== movingToken.color)
    : [];
  const finished = destination === FINISH_PROGRESS;

  const tokens = state.tokens.map((token) => {
    if (token.id === tokenId) return { ...token, progress: destination };
    if (captured.some((candidate) => candidate.id === token.id)) return { ...token, progress: -1 };
    return token;
  });

  const hasWon = tokens
    .filter((token) => token.color === player.color)
    .every((token) => token.progress === FINISH_PROGRESS);
  const bonusTurn = !hasWon && (state.dieValue === 6 || captured.length > 0 || finished);
  const action = captured.length > 0
    ? `${player.name} captured a token`
    : finished
      ? `${player.name} brought a token home`
      : `${player.name} moved a token`;
  let next: GameState = {
    ...state,
    tokens,
    phase: hasWon ? "finished" : bonusTurn ? "awaiting_roll" : "awaiting_move",
    dieValue: null,
    winnerId: hasWon ? player.id : null,
    events: event(state, hasWon ? `${player.name} wins the game!` : action, player.color, hasWon ? "finish" : captured.length ? "capture" : "move"),
  };

  if (!hasWon && !bonusTurn) next = endTurn(next);

  return {
    state: next,
    capturedTokenIds: captured.map((token) => token.id),
    finished,
    bonusTurn,
  };
}

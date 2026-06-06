import type { PlayerColor, Token } from "./types";

export type Coordinate = readonly [row: number, column: number];

export const TRACK: Coordinate[] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
];

export const START_INDEX: Record<PlayerColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

export const SAFE_TRACK_INDEXES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export const HOME_LANES: Record<PlayerColor, Coordinate[]> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
};

export const YARD_SPOTS: Record<PlayerColor, Coordinate[]> = {
  red: [[1, 1], [1, 4], [4, 1], [4, 4]],
  green: [[1, 10], [1, 13], [4, 10], [4, 13]],
  yellow: [[10, 10], [10, 13], [13, 10], [13, 13]],
  blue: [[10, 1], [10, 4], [13, 1], [13, 4]],
};

export function globalTrackIndex(token: Token): number | null {
  if (token.progress < 0 || token.progress > 51) return null;
  return (START_INDEX[token.color] + token.progress) % TRACK.length;
}

export function tokenCoordinate(token: Token): Coordinate {
  if (token.progress === -1) return YARD_SPOTS[token.color][token.index];
  if (token.progress <= 51) return TRACK[globalTrackIndex(token)!];
  if (token.progress <= 57) return HOME_LANES[token.color][token.progress - 52];
  return [7, 7];
}

export function coordinateKey(coordinate: Coordinate): string {
  return `${coordinate[0]}-${coordinate[1]}`;
}

import { Star } from "lucide-react";
import {
  HOME_LANES,
  SAFE_TRACK_INDEXES,
  START_INDEX,
  TRACK,
  coordinateKey,
  tokenCoordinate,
} from "@/lib/game/board";
import type { GameState, PlayerColor, Token } from "@/lib/game/types";

const colorClass: Record<PlayerColor, string> = {
  red: "is-red",
  green: "is-green",
  yellow: "is-yellow",
  blue: "is-blue",
};
const trackByCoordinate = new Map(TRACK.map((coordinate, index) => [coordinateKey(coordinate), index]));
const laneByCoordinate = new Map(
  Object.entries(HOME_LANES).flatMap(([color, coordinates]) =>
    coordinates.map((coordinate) => [coordinateKey(coordinate), color]),
  ),
);

function baseColor(row: number, column: number): PlayerColor | null {
  if (row < 6 && column < 6) return "red";
  if (row < 6 && column > 8) return "green";
  if (row > 8 && column > 8) return "yellow";
  if (row > 8 && column < 6) return "blue";
  return null;
}

function TokenPiece({ token, legal, onMove }: { token: Token; legal: boolean; onMove: (id: string) => void }) {
  return (
    <button
      type="button"
      className={`token ${colorClass[token.color]} ${legal ? "is-legal" : ""}`}
      disabled={!legal}
      onClick={() => onMove(token.id)}
      aria-label={`${token.color} token ${token.index + 1}${legal ? ", legal move" : ""}`}
    >
      <span />
    </button>
  );
}

export function GameBoard({ state, legalIds, onMove, activeColor }: {
  state: GameState;
  legalIds: string[];
  onMove: (id: string) => void;
  activeColor?: PlayerColor | null;
}) {
  const tokensByCell = new Map<string, Token[]>();
  for (const token of state.tokens) {
    const key = coordinateKey(tokenCoordinate(token));
    tokensByCell.set(key, [...(tokensByCell.get(key) ?? []), token]);
  }

  return (
    <div className="board-shell">
      <div className="ludo-board" role="grid" aria-label="Ludo board">
        {(["red", "green", "yellow", "blue"] as const).map((color) => (
          <div key={color} className={`home-base home-base-${color} ${colorClass[color]} ${activeColor === color ? "is-active-home" : ""}`} aria-hidden="true">
            <div className="home-base-inner">
              <i /><i /><i /><i />
            </div>
          </div>
        ))}
        {Array.from({ length: 225 }, (_, position) => {
          const row = Math.floor(position / 15);
          const column = position % 15;
          const key = `${row}-${column}`;
          const trackIndex = trackByCoordinate.get(key);
          const laneColor = laneByCoordinate.get(key) as PlayerColor | undefined;
          const homeColor = baseColor(row, column);
          const isCenter = row >= 6 && row <= 8 && column >= 6 && column <= 8;
          const startColor = Object.entries(START_INDEX).find(([, index]) => index === trackIndex)?.[0] as PlayerColor | undefined;
          const tokens = tokensByCell.get(key) ?? [];
          const classes = [
            "board-cell",
            trackIndex !== undefined ? "is-track" : "",
            laneColor ? `is-lane ${colorClass[laneColor]}` : "",
            homeColor && trackIndex === undefined && !laneColor ? `is-yard ${colorClass[homeColor]}` : "",
            startColor ? `is-start ${colorClass[startColor]}` : "",
            isCenter ? "is-center" : "",
          ].filter(Boolean).join(" ");

          return (
            <div key={key} className={classes} role="gridcell">
              {trackIndex !== undefined && SAFE_TRACK_INDEXES.has(trackIndex) && !startColor ? <Star className="safe-star" aria-hidden="true" /> : null}
              {tokens.length > 0 ? (
                <div className={`token-stack count-${Math.min(tokens.length, 4)}`}>
                  {tokens.map((token) => <TokenPiece key={token.id} token={token} legal={legalIds.includes(token.id)} onMove={onMove} />)}
                </div>
              ) : null}
            </div>
          );
        })}
        <div className="center-mark" aria-hidden="true">
          <span className="center-red" /><span className="center-green" />
          <span className="center-yellow" /><span className="center-blue" /><strong>L</strong>
        </div>
      </div>
    </div>
  );
}

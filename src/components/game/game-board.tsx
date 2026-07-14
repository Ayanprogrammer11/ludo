"use client";

import { Star } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { TOKEN_STEP_DURATION_MS, tokenAnimationFrames } from "@/lib/game/animation";
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

type BoardProps = {
  state: GameState;
  legalIds: string[];
  onMove: (id: string) => void;
  activeColor?: PlayerColor | null;
  interactionLocked?: boolean;
  onAnimationStateChange?: (animating: boolean) => void;
};

type TokenPositionStyle = CSSProperties & {
  "--token-row": number;
  "--token-column": number;
  "--token-x": string;
  "--token-y": string;
  "--token-size": string;
};

function baseColor(row: number, column: number): PlayerColor | null {
  if (row < 6 && column < 6) return "red";
  if (row < 6 && column > 8) return "green";
  if (row > 8 && column > 8) return "yellow";
  if (row > 8 && column < 6) return "blue";
  return null;
}

function cloneTokens(tokens: Token[]): Token[] {
  return tokens.map((token) => ({ ...token }));
}

function waitForStep() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, TOKEN_STEP_DURATION_MS));
}

function useAnimatedTokens(tokens: Token[], onAnimationStateChange?: (animating: boolean) => void) {
  const [displayed, setDisplayed] = useState(() => cloneTokens(tokens));
  const [animating, setAnimating] = useState(false);
  const [movingTokenId, setMovingTokenId] = useState<string | null>(null);
  const [returningIds, setReturningIds] = useState<Set<string>>(() => new Set());
  const displayedRef = useRef(displayed);
  const queueRef = useRef<Token[][]>([]);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);
  const callbackRef = useRef(onAnimationStateChange);

  useEffect(() => {
    callbackRef.current = onAnimationStateChange;
  }, [onAnimationStateChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      callbackRef.current?.(false);
    };
  }, []);

  useEffect(() => {
    queueRef.current.push(cloneTokens(tokens));
    if (processingRef.current) return;
    processingRef.current = true;

    const processQueue = async () => {
      while (mountedRef.current && queueRef.current.length > 0) {
        const target = queueRef.current.shift()!;
        const current = displayedRef.current;
        const frames = tokenAnimationFrames(current, target);
        if (frames.length === 0) continue;

        const currentById = new Map(current.map((token) => [token.id, token.progress]));
        const advancing = target.filter((token) => {
          const distance = token.progress - (currentById.get(token.id) ?? token.progress);
          return distance >= 1 && distance <= 6;
        });
        const isMove = advancing.length === 1;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (!isMove || reducedMotion) {
          displayedRef.current = target;
          setDisplayed(target);
          if (isMove) callbackRef.current?.(false);
          continue;
        }

        const moverId = advancing[0].id;
        const capturedIds = new Set(target
          .filter((token) => token.progress < (currentById.get(token.id) ?? token.progress))
          .map((token) => token.id));
        setAnimating(true);
        setMovingTokenId(moverId);
        callbackRef.current?.(true);

        for (let index = 0; index < frames.length && mountedRef.current; index += 1) {
          const frame = cloneTokens(frames[index]);
          setReturningIds(index === frames.length - 1 ? capturedIds : new Set());
          displayedRef.current = frame;
          setDisplayed(frame);
          await waitForStep();
        }

        setReturningIds(new Set());
        setMovingTokenId(null);
        setAnimating(false);
        callbackRef.current?.(false);
      }
      processingRef.current = false;
    };

    void processQueue();
  }, [tokens]);

  return { displayed, animating, movingTokenId, returningIds };
}

function tokenPlacement(index: number, count: number) {
  if (count === 1) return { x: 50, y: 50, size: 72 };
  const columns = count <= 4 ? 2 : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  return {
    x: ((index % columns) + 0.5) * (100 / columns),
    y: (Math.floor(index / columns) + 0.5) * (100 / rows),
    size: Math.min(46, 84 / Math.max(columns, rows)),
  };
}

function TokenPiece({ token, legal, moving, returning, placement, onMove }: {
  token: Token;
  legal: boolean;
  moving: boolean;
  returning: boolean;
  placement: ReturnType<typeof tokenPlacement>;
  onMove: (id: string) => void;
}) {
  const [row, column] = tokenCoordinate(token);
  const style: TokenPositionStyle = {
    "--token-row": row,
    "--token-column": column,
    "--token-x": `${placement.x}%`,
    "--token-y": `${placement.y}%`,
    "--token-size": `${placement.size}%`,
  };
  const classes = [
    "token-position",
    moving ? "is-moving" : "",
    returning ? "is-returning" : "",
  ].filter(Boolean).join(" ");
  const labelColor = token.color.charAt(0).toUpperCase() + token.color.slice(1);

  return (
    <div className={classes} style={style}>
      <button
        type="button"
        className={`token ${colorClass[token.color]} ${legal ? "is-legal" : ""}`}
        disabled={!legal}
        onClick={() => onMove(token.id)}
        aria-label={`${labelColor} piece ${token.index + 1}${legal ? ", legal move" : ""}`}
      >
        <span />
      </button>
    </div>
  );
}

const BoardSurface = memo(function BoardSurface({ activeColor }: { activeColor?: PlayerColor | null }) {
  return (
    <>
      {(["red", "green", "yellow", "blue"] as const).map((color) => (
        <div key={color} className={`home-base home-base-${color} ${colorClass[color]} ${activeColor === color ? "is-active-home" : ""}`} aria-hidden="true">
          <div className="home-base-inner"><i /><i /><i /><i /></div>
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
        const classes = [
          "board-cell",
          trackIndex !== undefined ? "is-track" : "",
          laneColor ? `is-lane ${colorClass[laneColor]}` : "",
          homeColor && trackIndex === undefined && !laneColor ? `is-yard ${colorClass[homeColor]}` : "",
          startColor ? `is-start ${colorClass[startColor]}` : "",
          isCenter ? "is-center" : "",
        ].filter(Boolean).join(" ");

        return (
          <div key={key} className={classes} aria-hidden="true">
            {trackIndex !== undefined && SAFE_TRACK_INDEXES.has(trackIndex) && !startColor ? <Star className="safe-star" /> : null}
          </div>
        );
      })}
      <div className="center-mark" aria-hidden="true">
        <span className="center-red" /><span className="center-green" />
        <span className="center-yellow" /><span className="center-blue" /><strong>L</strong>
      </div>
    </>
  );
});

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export const GameBoard = memo(function GameBoard({
  state,
  legalIds,
  onMove,
  activeColor,
  interactionLocked = false,
  onAnimationStateChange,
}: BoardProps) {
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  const { displayed, animating, movingTokenId, returningIds } = useAnimatedTokens(
    state.tokens,
    onAnimationStateChange,
  );
  const legalSet = useMemo(
    () => new Set(interactionLocked || animating ? [] : legalIds),
    [animating, interactionLocked, legalIds],
  );
  const grouped = new Map<string, Token[]>();
  for (const token of displayed) {
    const key = coordinateKey(tokenCoordinate(token));
    grouped.set(key, [...(grouped.get(key) ?? []), token]);
  }
  const placements = new Map<string, ReturnType<typeof tokenPlacement>>();
  for (const tokens of grouped.values()) {
    tokens.forEach((token, index) => placements.set(token.id, tokenPlacement(index, tokens.length)));
  }

  const guidance = animating
    ? "Moving piece step by step"
    : state.phase === "awaiting_move"
      ? `${legalIds.length} ${legalIds.length === 1 ? "piece can" : "pieces can"} move — choose a highlighted piece`
      : state.phase === "finished"
        ? "Match complete"
        : "Roll the die to begin your move";

  return (
    <div className="board-shell">
      <div className="ludo-board" role="group" aria-label="Ludo board" aria-busy={animating}>
        <BoardSurface activeColor={activeColor} />
        <div className="token-layer">
          {displayed.map((token) => (
            <TokenPiece
              key={token.id}
              token={token}
              legal={legalSet.has(token.id)}
              moving={movingTokenId === token.id}
              returning={returningIds.has(token.id)}
              placement={placements.get(token.id)!}
              onMove={(id) => onMoveRef.current(id)}
            />
          ))}
        </div>
      </div>
      <p className="board-guidance" aria-live="polite">{guidance}</p>
    </div>
  );
}, (previous, next) => (
  previous.state === next.state
  && previous.activeColor === next.activeColor
  && previous.interactionLocked === next.interactionLocked
  && sameIds(previous.legalIds, next.legalIds)
));

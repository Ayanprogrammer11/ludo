import type { Token } from "./types";

export const TOKEN_STEP_DURATION_MS = 145;

function sameProgress(left: Token[], right: Token[]): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((token) => [token.id, token]));
  return left.every((token) => {
    const candidate = rightById.get(token.id);
    return candidate?.progress === token.progress
      && (candidate.laps ?? 0) === (token.laps ?? 0);
  });
}

export function tokenForwardDistance(current: Token, target: Token): number {
  if (current.progress === -1 && target.progress === 0) return 1;
  if (current.progress < 0 || target.progress < 0) return 0;

  if (current.progress <= 51 && target.progress <= 51) {
    return ((target.laps ?? 0) - (current.laps ?? 0)) * 52
      + target.progress
      - current.progress;
  }
  return target.progress - current.progress;
}

function advancedToken(current: Token, target: Token, step: number): Token {
  if (current.progress === -1) return { ...current, progress: 0 };
  if (current.progress <= 51 && target.progress <= 51) {
    const rawProgress = current.progress + step;
    return {
      ...current,
      progress: rawProgress % 52,
      laps: (current.laps ?? 0) + Math.floor(rawProgress / 52),
    };
  }
  return { ...current, progress: current.progress + step, laps: target.laps ?? current.laps ?? 0 };
}

/**
 * Expands one authoritative move snapshot into the visual frames needed to
 * travel one board square at a time. Captured pieces stay on the destination
 * square until the moving piece arrives, then return to their yards.
 */
export function tokenAnimationFrames(current: Token[], target: Token[]): Token[][] {
  if (sameProgress(current, target)) return [];

  const currentById = new Map(current.map((token) => [token.id, token]));
  const advancing = target.filter((token) => {
    const previous = currentById.get(token.id);
    const distance = previous ? tokenForwardDistance(previous, token) : 0;
    return distance >= 1 && distance <= 6;
  });

  // A normal Ludo command advances exactly one piece. Larger/multiple changes
  // are reconnects, replay seeks, or resets and should synchronize instantly.
  if (advancing.length !== 1) return [target];

  const mover = advancing[0];
  const start = currentById.get(mover.id)!;
  const distance = tokenForwardDistance(start, mover);
  const frames: Token[][] = [];
  let working = current.map((token) => ({ ...token }));

  for (let step = 1; step <= distance; step += 1) {
    working = working.map((token) => token.id === mover.id ? advancedToken(start, mover, step) : token);
    frames.push(working);
  }

  if (!sameProgress(working, target)) frames.push(target);
  return frames;
}

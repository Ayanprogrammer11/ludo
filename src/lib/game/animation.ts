import type { Token } from "./types";

export const TOKEN_STEP_DURATION_MS = 145;

function sameProgress(left: Token[], right: Token[]): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((token) => [token.id, token.progress]));
  return left.every((token) => rightById.get(token.id) === token.progress);
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
    const distance = previous ? token.progress - previous.progress : 0;
    return distance >= 1 && distance <= 6;
  });

  // A normal Ludo command advances exactly one piece. Larger/multiple changes
  // are reconnects, replay seeks, or resets and should synchronize instantly.
  if (advancing.length !== 1) return [target];

  const mover = advancing[0];
  const start = currentById.get(mover.id)!.progress;
  const frames: Token[][] = [];
  let working = current.map((token) => ({ ...token }));

  for (let progress = start + 1; progress <= mover.progress; progress += 1) {
    working = working.map((token) => token.id === mover.id ? { ...token, progress } : token);
    frames.push(working);
  }

  if (!sameProgress(working, target)) frames.push(target);
  return frames;
}

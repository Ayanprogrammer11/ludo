import { describe, expect, it } from "vitest";
import { tokenAnimationFrames } from "./animation";
import { createGame } from "./engine";

describe("token animation frames", () => {
  it("moves across the track one square at a time", () => {
    const game = createGame(["Ada", "Linus"]);
    game.tokens.find((token) => token.id === "red-0")!.progress = 0;
    const current = structuredClone(game.tokens);
    const target = structuredClone(game.tokens);
    target.find((token) => token.id === "red-0")!.progress = 6;

    expect(tokenAnimationFrames(current, target).map((frame) =>
      frame.find((token) => token.id === "red-0")!.progress,
    )).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns a captured piece to its yard after the mover arrives", () => {
    const game = createGame(["Ada", "Linus"]);
    game.tokens.find((token) => token.id === "red-0")!.progress = 13;
    game.tokens.find((token) => token.id === "green-0")!.progress = 1;
    const target = structuredClone(game.tokens);
    target.find((token) => token.id === "red-0")!.progress = 14;
    target.find((token) => token.id === "green-0")!.progress = -1;

    const frames = tokenAnimationFrames(game.tokens, target);
    expect(frames).toHaveLength(2);
    expect(frames[0].find((token) => token.id === "green-0")!.progress).toBe(1);
    expect(frames[1].find((token) => token.id === "green-0")!.progress).toBe(-1);
  });

  it("animates a capture-gated piece across the outer-lap boundary", () => {
    const game = createGame(["Ada", "Linus"]);
    const mover = game.tokens.find((token) => token.id === "red-0")!;
    mover.progress = 50;
    const target = structuredClone(game.tokens);
    const targetMover = target.find((token) => token.id === "red-0")!;
    targetMover.progress = 2;
    targetMover.laps = 1;

    expect(tokenAnimationFrames(game.tokens, target).map((frame) => {
      const token = frame.find((candidate) => candidate.id === "red-0")!;
      return [token.progress, token.laps];
    })).toEqual([[51, 0], [0, 1], [1, 1], [2, 1]]);
  });

  it("synchronizes reconnect jumps immediately", () => {
    const game = createGame(["Ada", "Linus"]);
    const target = structuredClone(game.tokens);
    target.find((token) => token.id === "red-0")!.progress = 20;

    expect(tokenAnimationFrames(game.tokens, target)).toEqual([target]);
  });
});

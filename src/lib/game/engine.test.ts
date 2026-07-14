import { describe, expect, it } from "vitest";
import { createGame, forfeitPlayer, legalTokenIds, moveToken, rollDie } from "./engine";

describe("Ludo rules engine", () => {
  it("only lets a token leave its yard on a six", () => {
    const game = createGame(["Ada", "Linus"]);
    expect(rollDie(game, 3).currentPlayerId).toBe("player-2");

    const rolled = rollDie(game, 6);
    expect(legalTokenIds(rolled)).toEqual(["red-0", "red-1", "red-2", "red-3"]);
    expect(moveToken(rolled, "red-0").state.tokens.find((token) => token.id === "red-0")?.progress).toBe(0);
  });

  it("requires an exact roll to finish", () => {
    const game = createGame(["Ada", "Linus"]);
    game.tokens.find((token) => token.id === "red-0")!.progress = 55;

    expect(legalTokenIds(rollDie(game, 3))).not.toContain("red-0");
    expect(moveToken(rollDie(game, 2), "red-0").finished).toBe(true);
  });

  it("captures on unsafe squares and awards a bonus turn", () => {
    const game = createGame(["Ada", "Linus"]);
    game.tokens.find((token) => token.id === "red-0")!.progress = 13;
    game.tokens.find((token) => token.id === "green-0")!.progress = 1;

    const result = moveToken(rollDie(game, 1), "red-0");
    expect(result.capturedTokenIds).toEqual(["green-0"]);
    expect(result.state.tokens.find((token) => token.id === "green-0")?.progress).toBe(-1);
    expect(result.state.currentPlayerId).toBe("player-1");
    expect(result.state.phase).toBe("awaiting_roll");
  });

  it("does not capture a token on a safe square", () => {
    const game = createGame(["Ada", "Linus"]);
    game.tokens.find((token) => token.id === "red-0")!.progress = 12;
    game.tokens.find((token) => token.id === "green-0")!.progress = 0;

    const result = moveToken(rollDie(game, 1), "red-0");
    expect(result.capturedTokenIds).toEqual([]);
    expect(result.state.tokens.find((token) => token.id === "green-0")?.progress).toBe(0);
  });

  it("forfeits the turn after three consecutive sixes", () => {
    let game = createGame(["Ada", "Linus"]);
    game = moveToken(rollDie(game, 6), "red-0").state;
    game = moveToken(rollDie(game, 6), "red-0").state;
    game = rollDie(game, 6);

    expect(game.currentPlayerId).toBe("player-2");
    expect(game.phase).toBe("awaiting_roll");
    expect(game.tokens.find((token) => token.id === "red-0")?.progress).toBe(6);
  });

  it("skips forfeited players when advancing turns", () => {
    let game = createGame(["Ada", "Linus", "Grace"]);
    game = forfeitPlayer(game, "player-2", "Linus left");
    game = rollDie(game, 3);

    expect(game.currentPlayerId).toBe("player-3");
    expect(game.players.find((player) => player.id === "player-2")?.forfeited).toBe(true);
  });

  it("makes the remaining player current when a forfeit wins the game", () => {
    const game = forfeitPlayer(createGame(["Ada", "Linus"]), "player-1", "Ada left");

    expect(game.phase).toBe("finished");
    expect(game.winnerId).toBe("player-2");
    expect(game.currentPlayerId).toBe("player-2");
    expect(game.events[0].message).toBe("Linus wins by forfeit");
  });

  it("cannot pass an opponent blockade", () => {
    const game = createGame(["Ada", "Linus"]);
    game.tokens.find((token) => token.id === "red-0")!.progress = 8;
    game.tokens.find((token) => token.id === "green-0")!.progress = 51;
    game.tokens.find((token) => token.id === "green-1")!.progress = 51;

    expect(legalTokenIds(rollDie(game, 6))).not.toContain("red-0");
  });

  it("cannot pass a blockade on the final track square while entering home", () => {
    const game = createGame(["Ada", "Linus", "Grace", "Ken"]);
    game.tokens.find((token) => token.id === "red-0")!.progress = 50;
    game.tokens.find((token) => token.id === "blue-0")!.progress = 12;
    game.tokens.find((token) => token.id === "blue-1")!.progress = 12;

    expect(legalTokenIds(rollDie(game, 2))).not.toContain("red-0");
  });

  it("lets every color complete its circuit and enter its home lane", () => {
    const game = createGame(["Ada", "Linus", "Grace", "Ken"]);

    for (const player of game.players) {
      const token = game.tokens.find((candidate) => candidate.color === player.color)!;
      token.progress = 50;
      game.currentPlayerId = player.id;
      game.phase = "awaiting_roll";
      game.dieValue = null;

      const result = moveToken(rollDie(game, 2), token.id);
      expect(result.state.tokens.find((candidate) => candidate.id === token.id)?.progress).toBe(52);
    }
  });

  it("advances every color from its start square all the way home", () => {
    let game = createGame(["Ada", "Linus", "Grace", "Ken"]);

    for (const player of game.players) {
      const tokenId = `${player.color}-0`;
      game.tokens.find((token) => token.id === tokenId)!.progress = 0;

      for (const die of [...Array<number>(11).fill(5), 2]) {
        game.currentPlayerId = player.id;
        game.phase = "awaiting_roll";
        game.dieValue = null;
        game = moveToken(rollDie(game, die), tokenId).state;
      }

      expect(game.tokens.find((token) => token.id === tokenId)?.progress).toBe(57);
    }
  });

  it("preserves the active player's pending move when someone else forfeits", () => {
    const rolled = rollDie(createGame(["Ada", "Linus", "Grace"]), 6);
    const game = forfeitPlayer(rolled, "player-3", "Grace left");

    expect(game.currentPlayerId).toBe("player-1");
    expect(game.phase).toBe("awaiting_move");
    expect(game.dieValue).toBe(6);
    expect(legalTokenIds(game)).toHaveLength(4);
  });

  it("lets the last yard token enter after rolling six even when own tokens occupy the start", () => {
    const game = createGame(["Ada", "Linus"]);
    game.tokens.find((token) => token.id === "red-0")!.progress = 0;
    game.tokens.find((token) => token.id === "red-1")!.progress = 0;
    game.tokens.find((token) => token.id === "red-2")!.progress = 12;

    const rolled = rollDie(game, 6);

    expect(legalTokenIds(rolled)).toContain("red-3");
    expect(moveToken(rolled, "red-3").state.tokens.find((token) => token.id === "red-3")?.progress).toBe(0);
  });

  it("lets the last yard token enter after the other three have reached home", () => {
    const game = createGame(["Ada", "Linus"]);
    for (const token of game.tokens.filter((candidate) => candidate.color === "red").slice(0, 3)) {
      token.progress = 57;
    }

    expect(legalTokenIds(rollDie(game, 6))).toEqual(["red-3"]);
  });

  it("keeps match-feed event ids unique after the feed reaches its maximum length", () => {
    let game = createGame(["Ada", "Linus"]);
    game.events = Array.from({ length: 8 }, (_, index) => ({
      id: `existing-${index}`,
      message: `Existing event ${index}`,
      color: "red" as const,
      kind: "turn" as const,
    }));

    game = moveToken(rollDie(game, 6), "red-0").state;
    game = moveToken(rollDie(game, 6), "red-0").state;

    expect(new Set(game.events.map((item) => item.id)).size).toBe(game.events.length);
  });
});

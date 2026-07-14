import { describe, expect, it } from "vitest";
import { createGame, forfeitPlayer, legalTokenIds, moveToken, rollDice, rollDie } from "./engine";
import { DEFAULT_GAME_RULES } from "./rules";

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

  it("can let a piece leave the yard on any roll", () => {
    const game = createGame(["Ada", "Linus"], "open-entry", {
      ...DEFAULT_GAME_RULES,
      mustRollSixToEnter: false,
      threeEntryAttempts: false,
    });
    const rolled = rollDie(game, 3);

    expect(legalTokenIds(rolled)).toContain("red-0");
    expect(moveToken(rolled, "red-0").state.tokens.find((token) => token.id === "red-0")?.progress).toBe(0);
  });

  it("can grant three attempts to roll an entry six", () => {
    let game = createGame(["Ada", "Linus"], "three-tries", {
      ...DEFAULT_GAME_RULES,
      threeEntryAttempts: true,
    });

    game = rollDie(game, 2);
    expect(game.currentPlayerId).toBe("player-1");
    expect(game.entryAttempts).toBe(1);
    game = rollDie(game, 4);
    expect(game.currentPlayerId).toBe("player-1");
    expect(game.entryAttempts).toBe(2);
    game = rollDie(game, 3);
    expect(game.currentPlayerId).toBe("player-2");
    expect(game.entryAttempts).toBe(0);
  });

  it("can disable the bonus roll after a six", () => {
    const game = createGame(["Ada", "Linus"], "no-six-bonus", {
      ...DEFAULT_GAME_RULES,
      bonusRollOnSix: false,
      threeSixesLoseTurn: false,
    });
    const moved = moveToken(rollDie(game, 6), "red-0").state;

    expect(moved.currentPlayerId).toBe("player-2");
    expect(moved.phase).toBe("awaiting_roll");
  });

  it("can disable capture and home bonus rolls", () => {
    let game = createGame(["Ada", "Linus"], "no-action-bonus", {
      ...DEFAULT_GAME_RULES,
      bonusRollOnCapture: false,
      bonusRollOnHome: false,
    });
    game.tokens.find((token) => token.id === "red-0")!.progress = 13;
    game.tokens.find((token) => token.id === "green-0")!.progress = 1;
    game = moveToken(rollDie(game, 1), "red-0").state;
    expect(game.currentPlayerId).toBe("player-2");

    game.currentPlayerId = "player-1";
    game.phase = "awaiting_roll";
    game.tokens.find((token) => token.id === "red-0")!.progress = 56;
    game = moveToken(rollDie(game, 1), "red-0").state;
    expect(game.currentPlayerId).toBe("player-2");
  });

  it("can make marked safe squares capturable", () => {
    const game = createGame(["Ada", "Linus"], "unsafe-board", {
      ...DEFAULT_GAME_RULES,
      safeSquares: false,
    });
    game.tokens.find((token) => token.id === "red-0")!.progress = 12;
    game.tokens.find((token) => token.id === "green-0")!.progress = 0;

    expect(moveToken(rollDie(game, 1), "red-0").capturedTokenIds).toEqual(["green-0"]);
  });

  it("can disable blockades", () => {
    const game = createGame(["Ada", "Linus"], "open-track", {
      ...DEFAULT_GAME_RULES,
      blockades: false,
    });
    game.tokens.find((token) => token.id === "red-0")!.progress = 8;
    game.tokens.find((token) => token.id === "green-0")!.progress = 51;
    game.tokens.find((token) => token.id === "green-1")!.progress = 51;

    expect(legalTokenIds(rollDie(game, 6))).toContain("red-0");
  });

  it("can require a capture before entering the home lane", () => {
    let game = createGame(["Ada", "Linus"], "capture-gate", {
      ...DEFAULT_GAME_RULES,
      captureBeforeHome: true,
    });
    game.tokens.find((token) => token.id === "red-0")!.progress = 51;
    expect(legalTokenIds(rollDie(game, 1))).not.toContain("red-0");

    game.phase = "awaiting_roll";
    game.dieValue = null;
    game.pendingDice = [];
    game.tokens.find((token) => token.id === "red-0")!.progress = 13;
    game.tokens.find((token) => token.id === "green-0")!.progress = 1;
    game = moveToken(rollDie(game, 1), "red-0").state;
    game.tokens.find((token) => token.id === "red-0")!.progress = 51;
    expect(game.players.find((player) => player.id === "player-1")?.hasCaptured).toBe(true);
    expect(legalTokenIds(rollDie(game, 1))).toContain("red-0");
  });

  it("can accept an over-roll at the finish", () => {
    const game = createGame(["Ada", "Linus"], "easy-finish", {
      ...DEFAULT_GAME_RULES,
      exactRollToFinish: false,
    });
    game.tokens.find((token) => token.id === "red-0")!.progress = 55;

    expect(moveToken(rollDie(game, 5), "red-0").state.tokens.find((token) => token.id === "red-0")?.progress).toBe(57);
  });

  it("spends multiple dice in any order and queues the bonus until the tray is empty", () => {
    let game = createGame(["Ada", "Linus"], "two-dice", {
      ...DEFAULT_GAME_RULES,
      dicePerTurn: 2,
    });
    game = rollDice(game, [6, 3]);

    expect(game.pendingDice).toEqual([6, 3]);
    expect(legalTokenIds(game, 3)).toEqual([]);
    game = moveToken(game, "red-0", 6).state;
    expect(game.pendingDice).toEqual([3]);
    expect(game.phase).toBe("awaiting_move");
    expect(legalTokenIds(game, 3)).toContain("red-0");
    game = moveToken(game, "red-0", 3).state;
    expect(game.tokens.find((token) => token.id === "red-0")?.progress).toBe(3);
    expect(game.currentPlayerId).toBe("player-1");
    expect(game.phase).toBe("awaiting_roll");
  });

  it("supports four dice and rejects the wrong tray size", () => {
    const game = createGame(["Ada", "Linus"], "four-dice", {
      ...DEFAULT_GAME_RULES,
      dicePerTurn: 4,
      mustRollSixToEnter: false,
      threeEntryAttempts: false,
    });

    expect(() => rollDice(game, [1, 2])).toThrowError("This table rolls 4 dice per turn.");
    expect(rollDice(game, [1, 2, 3, 4]).pendingDice).toEqual([1, 2, 3, 4]);
  });

  it("can spend different dice on different pieces", () => {
    let game = createGame(["Ada", "Linus"], "split-dice", {
      ...DEFAULT_GAME_RULES,
      dicePerTurn: 2,
    });
    game.tokens.find((token) => token.id === "red-0")!.progress = 0;
    game.tokens.find((token) => token.id === "red-1")!.progress = 0;
    game = rollDice(game, [2, 3]);
    game = moveToken(game, "red-1", 3).state;
    game = moveToken(game, "red-0", 2).state;

    expect(game.tokens.find((token) => token.id === "red-0")?.progress).toBe(2);
    expect(game.tokens.find((token) => token.id === "red-1")?.progress).toBe(3);
    expect(game.currentPlayerId).toBe("player-2");
  });

  it("applies the three-sixes penalty to a multi-dice tray", () => {
    const game = createGame(["Ada", "Linus"], "triple-six", {
      ...DEFAULT_GAME_RULES,
      dicePerTurn: 3,
    });
    const rolled = rollDice(game, [6, 6, 6]);

    expect(rolled.currentPlayerId).toBe("player-2");
    expect(rolled.pendingDice).toEqual([]);
  });
});

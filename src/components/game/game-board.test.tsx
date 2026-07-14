import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createGame, legalTokenIds, rollDie } from "@/lib/game/engine";
import { GameBoard } from "./game-board";

describe("GameBoard", () => {
  it("renders the final yard token as a clickable glowing move after a six", () => {
    const game = createGame(["Ada", "Linus"]);
    game.tokens.find((token) => token.id === "red-0")!.progress = 0;
    game.tokens.find((token) => token.id === "red-1")!.progress = 0;
    game.tokens.find((token) => token.id === "red-2")!.progress = 12;
    const rolled = rollDie(game, 6);

    const html = renderToStaticMarkup(
      <GameBoard state={rolled} legalIds={legalTokenIds(rolled)} onMove={() => undefined} />,
    );

    expect(html).toContain('class="token is-red is-legal"');
    expect(html).toContain('aria-label="Red piece 4, legal move"');
  });
});

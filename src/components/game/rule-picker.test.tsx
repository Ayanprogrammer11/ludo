import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { rollDice, createGame } from "@/lib/game/engine";
import { DEFAULT_GAME_RULES } from "@/lib/game/rules";
import { DiceControl } from "./dice-control";
import { RulePicker, RulesDisclosure } from "./rule-picker";

describe("rule controls", () => {
  it("renders host presets, dice counts, and accessible rule switches", () => {
    const html = renderToStaticMarkup(
      <RulePicker rules={DEFAULT_GAME_RULES} isHost busy={false} onChange={() => undefined} />,
    );

    expect(html).toContain("House classic");
    expect(html).toContain("Fast table");
    expect(html).toContain("Strategic table");
    expect(html).toContain("Dice per turn");
    expect(html).toContain('role="switch"');
    expect(html).toContain("Capture before entering home");
  });

  it("shows guests a readable summary instead of editable controls", () => {
    const html = renderToStaticMarkup(
      <RulePicker rules={{ ...DEFAULT_GAME_RULES, dicePerTurn: 3 }} isHost={false} busy={false} onChange={() => undefined} />,
    );

    expect(html).toContain("Custom rules");
    expect(html).toContain("3 dice per turn");
    expect(html).not.toContain('role="switch"');
  });

  it("renders every unspent die as a selectable move resource", () => {
    const game = rollDice(createGame(["Ada", "Linus"], "dice-ui", {
      ...DEFAULT_GAME_RULES,
      dicePerTurn: 2,
    }), [6, 3]);
    const html = renderToStaticMarkup(
      <DiceControl game={game} selectedIndex={0} disabled={false} rolling={false} onSelect={() => undefined} onRoll={() => undefined} />,
    );

    expect(html).toContain("Choose die");
    expect(html).toContain("Use die 1, showing 6");
    expect(html).toContain("Use die 2, showing 3");
  });

  it("keeps active rules discoverable during a match", () => {
    const html = renderToStaticMarkup(<RulesDisclosure rules={DEFAULT_GAME_RULES} />);
    expect(html).toContain("Match rules");
    expect(html).toContain("1 die · House classic");
  });
});

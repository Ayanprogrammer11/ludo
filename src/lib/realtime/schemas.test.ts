import { describe, expect, it } from "vitest";
import { createRoomSchema, displayNameSchema, gameRulesSchema, joinRoomSchema } from "./schemas";
import { DEFAULT_GAME_RULES } from "../game/rules";

describe("realtime input schemas", () => {
  it("rejects control characters in display names", () => {
    expect(displayNameSchema.safeParse("Ada\nAdmin").success).toBe(false);
  });

  it("creates rooms from the authenticated account instead of client-provided names", () => {
    expect(createRoomSchema.safeParse({}).success).toBe(true);
    expect(createRoomSchema.safeParse({ name: "Ada" }).success).toBe(false);
  });

  it("rejects unexpected command fields", () => {
    expect(joinRoomSchema.safeParse({ code: "ABC234", name: "Ada", admin: true }).success).toBe(false);
  });

  it("accepts complete rule sets and rejects unsupported dice counts", () => {
    expect(gameRulesSchema.safeParse(DEFAULT_GAME_RULES).success).toBe(true);
    expect(gameRulesSchema.safeParse({ ...DEFAULT_GAME_RULES, dicePerTurn: 5 }).success).toBe(false);
    expect(gameRulesSchema.safeParse({ dicePerTurn: 2 }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { createRoomSchema, joinRoomSchema } from "./schemas";

describe("realtime input schemas", () => {
  it("rejects control characters in display names", () => {
    expect(createRoomSchema.safeParse({ name: "Ada\nAdmin" }).success).toBe(false);
  });

  it("rejects unexpected command fields", () => {
    expect(joinRoomSchema.safeParse({ code: "ABC234", name: "Ada", admin: true }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { createRoomSchema, displayNameSchema, joinRoomSchema } from "./schemas";

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
});

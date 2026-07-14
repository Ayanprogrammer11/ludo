import { z } from "zod";

export const displayNameSchema = z.string().trim().min(1).max(24).regex(/^[^\p{Cc}\p{Cf}]+$/u);
export const roomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/);
export const reconnectTokenSchema = z.string().uuid();
export const commandIdSchema = z.string().uuid();
export const tokenIdSchema = z.string().regex(/^(red|green|yellow|blue)-[0-3]$/);
export const dieValueSchema = z.number().int().min(1).max(6);
export const gameRulesSchema = z.strictObject({
  dicePerTurn: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  mustRollSixToEnter: z.boolean(),
  threeEntryAttempts: z.boolean(),
  bonusRollOnSix: z.boolean(),
  threeSixesLoseTurn: z.boolean(),
  bonusRollOnCapture: z.boolean(),
  bonusRollOnHome: z.boolean(),
  safeSquares: z.boolean(),
  blockades: z.boolean(),
  captureBeforeHome: z.boolean(),
  exactRollToFinish: z.boolean(),
});

export const createRoomSchema = z.strictObject({});
export const joinRoomSchema = z.strictObject({ code: roomCodeSchema });
export const resumeRoomSchema = z.strictObject({ code: roomCodeSchema, reconnectToken: reconnectTokenSchema });
export const commandSchema = z.strictObject({ commandId: commandIdSchema });
export const leaveRoomSchema = commandSchema;
export const moveSchema = commandSchema.extend({ tokenId: tokenIdSchema, dieValue: dieValueSchema });
export const updateRulesSchema = commandSchema.extend({ rules: gameRulesSchema });

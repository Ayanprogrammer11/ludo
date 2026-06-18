import { z } from "zod";

export const displayNameSchema = z.string().trim().min(1).max(24).regex(/^[^\p{Cc}\p{Cf}]+$/u);
export const roomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/);
export const reconnectTokenSchema = z.string().uuid();
export const commandIdSchema = z.string().uuid();
export const tokenIdSchema = z.string().regex(/^(red|green|yellow|blue)-[0-3]$/);

export const createRoomSchema = z.strictObject({});
export const joinRoomSchema = z.strictObject({ code: roomCodeSchema });
export const resumeRoomSchema = z.strictObject({ code: roomCodeSchema, reconnectToken: reconnectTokenSchema });
export const commandSchema = z.strictObject({ commandId: commandIdSchema });
export const leaveRoomSchema = commandSchema;
export const moveSchema = commandSchema.extend({ tokenId: tokenIdSchema });

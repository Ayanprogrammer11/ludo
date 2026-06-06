import { z } from "zod";

export const displayNameSchema = z.string().trim().min(1).max(24);
export const roomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/);
export const reconnectTokenSchema = z.string().uuid();
export const commandIdSchema = z.string().uuid();
export const tokenIdSchema = z.string().regex(/^(red|green|yellow|blue)-[0-3]$/);

export const createRoomSchema = z.object({ name: displayNameSchema });
export const joinRoomSchema = z.object({ code: roomCodeSchema, name: displayNameSchema });
export const resumeRoomSchema = z.object({ code: roomCodeSchema, reconnectToken: reconnectTokenSchema });
export const commandSchema = z.object({ commandId: commandIdSchema });
export const moveSchema = commandSchema.extend({ tokenId: tokenIdSchema });

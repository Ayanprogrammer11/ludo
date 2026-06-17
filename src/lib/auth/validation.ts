import { z } from "zod";

const passwordCategory = (pattern: RegExp) => (value: string) => pattern.test(value);
const commonPasswords = new Set([
  "passwordpassword",
  "password1234",
  "qwerty123456",
  "letmein12345",
  "ludoludo123",
]);

export const authEmailSchema = z.string().trim().toLowerCase().email().max(254);
export const authDisplayNameSchema = z.string()
  .trim()
  .min(2, "Name must be at least 2 characters.")
  .max(24, "Name must be 24 characters or fewer.")
  .regex(/^[^\p{Cc}\p{Cf}]+$/u, "Name contains unsupported characters.");

export const authPasswordSchema = z.string()
  .min(12, "Password must be at least 12 characters.")
  .max(128, "Password must be 128 characters or fewer.")
  .refine((value) => !commonPasswords.has(value.toLowerCase()), "Choose a less common password.")
  .refine((value) => {
    const categories = [
      passwordCategory(/[a-z]/)(value),
      passwordCategory(/[A-Z]/)(value),
      passwordCategory(/[0-9]/)(value),
      passwordCategory(/[^a-zA-Z0-9]/)(value),
    ].filter(Boolean).length;
    return categories >= 3;
  }, "Use at least three of: lowercase, uppercase, numbers, symbols.");

export const signupSchema = z.strictObject({
  displayName: authDisplayNameSchema,
  email: authEmailSchema,
  password: authPasswordSchema,
});

export const loginSchema = z.strictObject({
  email: authEmailSchema,
  password: z.string().min(1).max(128),
});

export const updateProfileSchema = z.strictObject({
  displayName: authDisplayNameSchema,
});

export function safeNextPath(value: FormDataEntryValue | string | string[] | null | undefined, fallback = "/account") {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.startsWith("/api/") || raw.startsWith("/_next/")) return fallback;
  return raw;
}

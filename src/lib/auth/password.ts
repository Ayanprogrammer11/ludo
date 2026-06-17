import { randomBytes, scrypt as scryptCallback, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const DUMMY_SALT = "U1Umd7ACanJmZ6ZzgKf2JO-zltBzcvUJTTC2OWMrAgM";
const DUMMY_HASH = scryptSync("invalid-password", DUMMY_SALT, KEY_LENGTH).toString("base64url");

async function deriveKey(password: string, salt: string) {
  return Buffer.from(await scrypt(password, salt, KEY_LENGTH) as Buffer);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(32).toString("base64url");
  const hash = await deriveKey(password, salt);
  return {
    salt,
    hash: hash.toString("base64url"),
  };
}

export async function verifyPassword(password: string, salt = DUMMY_SALT, expectedHash = DUMMY_HASH) {
  const actual = await deriveKey(password, salt);
  const expected = Buffer.from(expectedHash, "base64url");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

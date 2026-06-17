export const SESSION_COOKIE_NAME = "ludo_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export function getSessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expiresAt),
    maxAge: SESSION_TTL_SECONDS,
    priority: "high" as const,
  };
}

export function parseSessionCookie(rawCookieHeader: string | string[] | undefined): string | null {
  const rawCookie = Array.isArray(rawCookieHeader) ? rawCookieHeader.join(";") : rawCookieHeader;
  if (!rawCookie) return null;
  for (const part of rawCookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== SESSION_COOKIE_NAME) continue;
    const value = rawValue.join("=");
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}

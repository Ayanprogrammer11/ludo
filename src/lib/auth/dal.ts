import "server-only";

import type { Route } from "next";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { parseSessionCookie, SESSION_COOKIE_NAME } from "./cookies";
import { authStore } from "./store";
import type { AccountDashboard, SessionValidation, StoredMatch } from "./types";
import { safeNextPath } from "./validation";

export const getOptionalSession = cache(async (): Promise<SessionValidation | null> => {
  const cookieStore = await cookies();
  await connection();
  return authStore.validateSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null);
});

export async function requireSession(nextPath?: string) {
  const session = await getOptionalSession();
  if (!session) {
    const next = safeNextPath(nextPath, "/account");
    redirect(`/login?next=${encodeURIComponent(next)}` as Route);
  }
  return session;
}

export async function getOptionalUser() {
  const session = await getOptionalSession();
  return session?.user ?? null;
}

export async function getAccountDashboard(): Promise<AccountDashboard> {
  const session = await requireSession("/account");
  const dashboard = await authStore.getDashboard(session.user.id);
  if (!dashboard) redirect("/login?next=/account");
  return dashboard;
}

export async function getAuthorizedMatch(matchId: string): Promise<StoredMatch | null> {
  const session = await requireSession(`/account/games/${encodeURIComponent(matchId)}`);
  return authStore.getMatchForUser(session.user.id, matchId);
}

export function hasSessionCookie(rawCookieHeader: string | string[] | undefined) {
  return Boolean(parseSessionCookie(rawCookieHeader));
}

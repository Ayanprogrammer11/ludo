"use server";

import "server-only";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { RateLimiter } from "../realtime/rate-limit";
import { getSessionCookieOptions, parseSessionCookie, SESSION_COOKIE_NAME } from "./cookies";
import { getOptionalSession, requireSession } from "./dal";
import { AuthError, authStore } from "./store";
import { loginSchema, safeNextPath, signupSchema, updateProfileSchema } from "./validation";

export type AuthActionState = {
  message: string;
  errors?: Record<string, string[] | undefined>;
};

const loginLimiter = new RateLimiter(12, 15 * 60 * 1000, 25_000);
const signupLimiter = new RateLimiter(6, 60 * 60 * 1000, 25_000);
const profileLimiter = new RateLimiter(20, 15 * 60 * 1000, 25_000);

function firstHeader(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

async function requestMeta() {
  const headerStore = await headers();
  const ip = firstHeader(headerStore.get("do-connecting-ip"))
    ?? firstHeader(headerStore.get("x-forwarded-for"))
    ?? firstHeader(headerStore.get("x-real-ip"))
    ?? "unknown";
  return {
    ip: ip.slice(0, 128),
    userAgent: headerStore.get("user-agent")?.slice(0, 512) ?? null,
  };
}

async function setSessionCookie(token: string, expiresAt: number) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions(expiresAt));
}

async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function signupAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const next = safeNextPath(formData.get("next"));
  const meta = await requestMeta();
  if (!signupLimiter.consume(`signup:${meta.ip}`)) {
    return { message: "Too many signup attempts. Wait a bit before trying again." };
  }

  const parsed = signupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      message: "Check the highlighted fields.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  let session: Awaited<ReturnType<typeof authStore.createSession>>;
  try {
    const user = await authStore.registerUser(parsed.data);
    session = await authStore.createSession(user.id, meta.userAgent);
  } catch (error) {
    if (error instanceof AuthError && error.code === "EMAIL_IN_USE") {
      return { message: "An account already exists for that email." };
    }
    throw error;
  }

  await setSessionCookie(session.token, session.expiresAt);
  revalidatePath("/");
  redirect(next as Route);
}

export async function loginAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const next = safeNextPath(formData.get("next"));
  const meta = await requestMeta();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!loginLimiter.consume(`login:${meta.ip}`) || !loginLimiter.consume(`login-email:${email || "blank"}`)) {
    return { message: "Too many login attempts. Wait a bit before trying again." };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { message: "The email or password was not accepted." };

  let session: Awaited<ReturnType<typeof authStore.authenticate>>;
  try {
    session = await authStore.authenticate({ ...parsed.data, userAgent: meta.userAgent });
  } catch (error) {
    if (error instanceof AuthError) return { message: "The email or password was not accepted." };
    throw error;
  }

  await setSessionCookie(session.token, session.expiresAt);
  revalidatePath("/");
  redirect(next as Route);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  const token = parseSessionCookie(cookieStore.toString());
  await authStore.revokeSessionToken(token);
  await clearSessionCookie();
  revalidatePath("/");
  redirect("/");
}

export async function updateProfileAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const session = await requireSession("/account");
  if (!profileLimiter.consume(`profile:${session.user.id}`)) {
    return { message: "Too many profile updates. Wait a bit before trying again." };
  }

  const parsed = updateProfileSchema.safeParse({
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return {
      message: "Check the highlighted fields.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  await authStore.updateProfile(session.user.id, parsed.data);
  await getOptionalSession();
  revalidatePath("/");
  revalidatePath("/account");
  return { message: "Profile updated." };
}

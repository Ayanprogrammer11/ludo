import { NextResponse, type NextRequest } from "next/server";
import { parseSessionCookie } from "@/lib/auth/cookies";

const protectedPrefixes = ["/account", "/room"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!isProtected || parseSessionCookie(request.headers.get("cookie") ?? undefined)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [{
    source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
    missing: [
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ],
  }],
};

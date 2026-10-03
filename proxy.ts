import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const protectedPath =
    path === "/" ||
    path === "/analysis" ||
    path.startsWith("/settings") ||
    path === "/onboarding";
  if (
    protectedPath &&
    !getSessionCookie(request, { cookiePrefix: "firstrep" })
  ) {
    const url = new URL("/auth", request.url);
    url.searchParams.set("returnTo", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  const nonce = generateRandomString(32);
  const isDev = process.env.NODE_ENV !== "production";
  const analyticsOrigin = process.env.NEXT_PUBLIC_POSTHOG_KEY
    ? new URL(
        process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      ).origin
    : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com " +
      analyticsOrigin +
      " " +
      (isDev ? "ws: wss:" : ""),
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://appleid.apple.com",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.well-known).*)",
  ],
};

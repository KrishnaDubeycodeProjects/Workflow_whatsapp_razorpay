import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  BACKGROUND_HEADER,
  REFRESH_AFTER_SECONDS,
  SESSION_COOKIE,
  readSession,
  refreshSessionToken,
  remainingSeconds,
  sessionCookieOptions,
} from "@/lib/auth";

// ═══════════════════════════════════════════════════════════════════
// Admin gate (Next.js 16 "proxy", formerly middleware).
// Public customer pages (/, /register, /checkout, /properties) and the
// public APIs n8n / customers rely on (/api/create-order, /api/verify-payment, /api/order-summary, /api/slots,
// /api/razorpay/webhook, /api/register, /api/receipt/pdf, /api/services,
// /api/webhook/*) are intentionally NOT matched.
//
// Session handling: a valid session is slid forward (new last-activity time)
// on real requests at most once a minute. Requests flagged as background
// polling never slide it, so an unattended desk times out after 30 minutes.
// ═══════════════════════════════════════════════════════════════════

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);

  // Already signed in → skip the login screen.
  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL("/admin", request.url)) : NextResponse.next();
  }

  if (session) {
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("Referrer-Policy", "same-origin");
    const background = request.headers.get(BACKGROUND_HEADER) === "1";
    const now = Date.now();
    if (!background && now / 1000 - session.seen >= REFRESH_AFTER_SECONDS) {
      res.cookies.set(SESSION_COOKIE, await refreshSessionToken(session, now), sessionCookieOptions(remainingSeconds(session, now)));
    }
    return res;
  }

  if (pathname.startsWith("/api/")) {
    const res = NextResponse.json(
      { success: false, error: "Your session has expired. Please sign in again." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
    if (request.cookies.has(SESSION_COOKIE)) res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
    return res;
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + search);
  const res = NextResponse.redirect(loginUrl);
  if (request.cookies.has(SESSION_COOKIE)) {
    loginUrl.searchParams.set("reason", "expired");
    const expired = NextResponse.redirect(loginUrl);
    expired.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
    return expired;
  }
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/login"],
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// ═══════════════════════════════════════════════════════════════════
// Admin gate (Next.js 16 "proxy", formerly middleware).
// Public customer pages (/, /register, /checkout, /properties) and the
// public APIs n8n / customers rely on (/api/create-order, /api/verify-payment, /api/order-summary, /api/slots,
// /api/razorpay/webhook, /api/register, /api/receipt/pdf, /api/services,
// /api/webhook/*) are intentionally NOT matched.
// ═══════════════════════════════════════════════════════════════════

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const authed = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  // Already signed in → skip the login screen.
  if (pathname === "/login") {
    return authed ? NextResponse.redirect(new URL("/admin", request.url)) : NextResponse.next();
  }

  if (authed) {
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/login"],
};

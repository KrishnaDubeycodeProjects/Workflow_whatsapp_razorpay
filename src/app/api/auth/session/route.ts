import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  readSession,
  refreshSessionToken,
  remainingSeconds,
  sessionCookieOptions,
  sessionDeadlines,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

// GET  /api/auth/session → current deadlines (does NOT extend the session).
// POST /api/auth/session → "Stay signed in": slides the idle window.
export async function GET(req: NextRequest) {
  const s = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!s) return NextResponse.json({ authenticated: false }, { status: 401, headers: noStore });
  return NextResponse.json({ authenticated: true, ...sessionDeadlines(s), serverNow: Date.now() }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  // Same-origin only (CSRF defence in depth on top of SameSite=Lax).
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ authenticated: false, error: "Bad origin" }, { status: 403, headers: noStore });
  }
  const s = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!s) return NextResponse.json({ authenticated: false }, { status: 401, headers: noStore });
  const now = Date.now();
  const token = await refreshSessionToken(s, now);
  const fresh = { ...s, seen: Math.floor(now / 1000) };
  const res = NextResponse.json({ authenticated: true, ...sessionDeadlines(fresh), serverNow: now }, { headers: noStore });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(remainingSeconds(s, now)));
  return res;
}

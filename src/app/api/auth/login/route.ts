import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  isAuthConfigured,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

// Best-effort brute-force throttle. On serverless each warm instance keeps its
// own map, so this slows attackers rather than hard-capping them; pair it with a
// strong ADMIN_PASSWORD.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; first: number }>();

function clientKey(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) {
    console.error("[auth] ADMIN_PASSWORD is not set — admin login is disabled.");
    return NextResponse.json(
      { success: false, error: "Admin login is not configured on this server. Set ADMIN_PASSWORD." },
      { status: 503 }
    );
  }

  const key = clientKey(req);
  const now = Date.now();
  const entry = failures.get(key);
  if (entry && now - entry.first < WINDOW_MS && entry.count >= MAX_FAILURES) {
    const retryMin = Math.ceil((WINDOW_MS - (now - entry.first)) / 60000);
    return NextResponse.json(
      { success: false, error: `Too many attempts. Try again in ${retryMin} minute${retryMin === 1 ? "" : "s"}.` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";

  if (!(await verifyPassword(password))) {
    const fresh = !entry || now - entry.first >= WINDOW_MS;
    failures.set(key, { count: fresh ? 1 : entry!.count + 1, first: fresh ? now : entry!.first });
    await new Promise((r) => setTimeout(r, 400)); // flatten timing / slow guessing
    return NextResponse.json({ success: false, error: "Incorrect password." }, { status: 401 });
  }

  failures.delete(key);
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions());
  return res;
}

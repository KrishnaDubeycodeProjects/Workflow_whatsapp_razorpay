// ═══════════════════════════════════════════════════════════════════
// GEC Admin Authentication
// Stateless, HMAC-SHA256 signed session cookie. Uses Web Crypto only, so it
// runs identically in proxy.ts, route handlers and server components.
//
// Env:
//   ADMIN_PASSWORD  (required) – the admin desk password. If unset, login is
//                   disabled and every protected route stays locked (fail closed).
//   AUTH_SECRET     (optional) – signing key. Defaults to ADMIN_PASSWORD, which
//                   means changing the password signs every session out.
// ═══════════════════════════════════════════════════════════════════

export const SESSION_COOKIE = "gec_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const encoder = new TextEncoder();

function signingSecret(): string {
  return process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || "";
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Compares a submitted password to ADMIN_PASSWORD without leaking timing. */
export async function verifyPassword(candidate: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof candidate !== "string") return false;
  // HMAC both sides so the comparison is over equal-length digests.
  const k = "gec-password-compare";
  const [a, b] = await Promise.all([hmacHex(k, candidate), hmacHex(k, expected)]);
  return constantTimeEqual(a, b);
}

/** Token format: `<expiresAtUnix>.<hmac(expiresAtUnix)>` */
export async function createSessionToken(nowMs: number = Date.now()): Promise<string> {
  const secret = signingSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD is not configured");
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  return `${exp}.${await hmacHex(secret, `gec-admin:${exp}`)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  const secret = signingSecret();
  if (!secret || !token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!expStr || !sig || !Number.isFinite(exp)) return false;
  if (exp * 1000 < Date.now()) return false;
  return constantTimeEqual(sig, await hmacHex(secret, `gec-admin:${exp}`));
}

export function sessionCookieOptions(maxAge: number = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Defense in depth for route handlers (in addition to proxy.ts). */
export async function isAdminRequest(req: { cookies: { get(name: string): { value: string } | undefined } }): Promise<boolean> {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

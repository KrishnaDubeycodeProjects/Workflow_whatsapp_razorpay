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
//
// Sessions end on whichever comes first: 30 min without activity (idle) or
// 12 h after sign-in (absolute). Real activity slides the idle window; the
// desk's background polling does not, so an unattended tab is signed out.
// ═══════════════════════════════════════════════════════════════════

export const SESSION_COOKIE = "gec_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // absolute lifetime: 12 hours from sign-in
export const IDLE_TIMEOUT_SECONDS = 60 * 30; // signed out after 30 minutes without activity
export const REFRESH_AFTER_SECONDS = 60; // slide the idle window at most once a minute
/** Requests carrying this header (background polling) never extend the idle window. */
export const BACKGROUND_HEADER = "x-gec-background";
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

export type Session = { iat: number; seen: number; nonce: string };

/** Token format: `v2.<issuedAtUnix>.<lastSeenUnix>.<nonce>.<hmac>` */
async function sign(secret: string, iat: number, seen: number, nonce: string): Promise<string> {
  return `v2.${iat}.${seen}.${nonce}.${await hmacHex(secret, `gec-admin:v2:${iat}:${seen}:${nonce}`)}`;
}

function randomNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(nowMs: number = Date.now()): Promise<string> {
  const secret = signingSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD is not configured");
  const now = Math.floor(nowMs / 1000);
  return sign(secret, now, now, randomNonce());
}

/** Same session (iat + nonce), new last-activity time. */
export async function refreshSessionToken(s: Session, nowMs: number = Date.now()): Promise<string> {
  return sign(signingSecret(), s.iat, Math.floor(nowMs / 1000), s.nonce);
}

/** Returns the session if the signature is valid and neither the idle nor the absolute limit has passed. */
export async function readSession(token: string | undefined | null, nowMs: number = Date.now()): Promise<Session | null> {
  const secret = signingSecret();
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v2") return null; // older token formats are simply signed out
  const [, iatStr, seenStr, nonce, sig] = parts;
  const iat = Number(iatStr);
  const seen = Number(seenStr);
  if (!Number.isInteger(iat) || !Number.isInteger(seen) || !/^[0-9a-f]{32}$/.test(nonce) || seen < iat) return null;
  const expected = (await sign(secret, iat, seen, nonce)).split(".")[4];
  if (!constantTimeEqual(sig, expected)) return null;
  const now = Math.floor(nowMs / 1000);
  if (now >= iat + SESSION_TTL_SECONDS) return null; // absolute expiry
  if (now >= seen + IDLE_TIMEOUT_SECONDS) return null; // idle expiry
  if (seen > now + 60) return null; // clock-skew guard
  return { iat, seen, nonce };
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  return (await readSession(token)) !== null;
}

/** Unix-ms timestamps the client uses for its idle warning. */
export function sessionDeadlines(s: Session) {
  return {
    idleExpiresAt: (s.seen + IDLE_TIMEOUT_SECONDS) * 1000,
    absoluteExpiresAt: (s.iat + SESSION_TTL_SECONDS) * 1000,
  };
}

/** Cookie lifetime = whatever is left of the absolute window. */
export function remainingSeconds(s: Session, nowMs: number = Date.now()): number {
  return Math.max(0, s.iat + SESSION_TTL_SECONDS - Math.floor(nowMs / 1000));
}

export function sessionCookieOptions(maxAge: number = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const, // blocks cross-site POSTs (CSRF) while keeping links to /admin working
    path: "/",
    maxAge,
  };
}

/** Defense in depth for route handlers (in addition to proxy.ts). */
export async function isAdminRequest(req: { cookies: { get(name: string): { value: string } | undefined } }): Promise<boolean> {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

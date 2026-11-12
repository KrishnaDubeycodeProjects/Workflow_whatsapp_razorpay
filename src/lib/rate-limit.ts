import type { NextRequest } from "next/server";

// ═══════════════════════════════════════════════════════════════════
// Best-effort, in-memory fixed-window rate limiter for public endpoints.
// On serverless each warm instance keeps its own window, so this is a
// speed bump against scripted abuse, not a hard global quota.
// ═══════════════════════════════════════════════════════════════════
const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") || "unknown").trim();
}

/** Returns seconds to wait if the caller is over the limit, otherwise 0. */
export function rateLimit(key: string, limit: number, windowMs: number): number {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 0;
  }
  b.count += 1;
  return b.count > limit ? Math.ceil((b.resetAt - now) / 1000) : 0;
}

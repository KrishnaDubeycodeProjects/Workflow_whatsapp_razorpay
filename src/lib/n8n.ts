// ═══════════════════════════════════════════════════════════════════
// Calls from the portal to n8n webhooks. Every call carries the shared
// secret header; the n8n workflow rejects requests without it, so nobody
// else can mark orders paid or trigger WhatsApp messages through n8n.
// ═══════════════════════════════════════════════════════════════════
export const INTERNAL_SECRET_HEADER = "X-GEC-Internal-Secret";

export async function postToN8n(
  url: string | undefined,
  payload: unknown,
  timeoutMs = 10000
): Promise<{ ok: boolean; status: number; json: any }> {
  const secret = process.env.GEC_INTERNAL_SECRET;
  if (!url || !secret) {
    // Not configured → caller uses its direct fallback path.
    return { ok: false, status: 0, json: { error: !url ? "n8n URL not configured" : "GEC_INTERNAL_SECRET not configured" } };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", [INTERNAL_SECRET_HEADER]: secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json: any = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } catch (err: any) {
    return { ok: false, status: 0, json: { error: err?.message || String(err) } };
  }
}

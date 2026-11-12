import { NextRequest, NextResponse } from "next/server";
import { listAvailableSlots } from "@/lib/booking";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Public availability for the website slot picker (no customer data).
// GET /api/slots            → all bookable slots in the 30-day window
// GET /api/slots?date=YYYY-MM-DD → one day
export async function GET(req: NextRequest) {
  const wait = rateLimit(`slots:${clientIp(req)}`, 120, 10 * 60 * 1000);
  if (wait) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const date = req.nextUrl.searchParams.get("date");
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))) {
    return NextResponse.json({ error: "Use date=YYYY-MM-DD." }, { status: 400 });
  }
  try {
    const slots = await listAvailableSlots(date || undefined);
    return NextResponse.json({ success: true, slots }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[slots] error:", err);
    return NextResponse.json({ error: "Could not load availability." }, { status: 500 });
  }
}

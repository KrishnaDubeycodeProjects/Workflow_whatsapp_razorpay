import { NextRequest, NextResponse } from "next/server";
import { getOrderContext, isLiveHold, UUID_RE } from "@/lib/booking";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════
// Checkout page bootstrap: what is this booking and what does it still need?
// Requires the order id AND the WhatsApp number it belongs to; returns no
// health/waiver data — only what the checkout screen shows.
// ═══════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const wait = rateLimit(`order-summary:${clientIp(req)}`, 60, 10 * 60 * 1000);
  if (wait) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const orderId = req.nextUrl.searchParams.get("orderId") || req.nextUrl.searchParams.get("order_id") || "";
  const phoneDigits = (req.nextUrl.searchParams.get("phone") || "").replace(/\D/g, "");
  if (!UUID_RE.test(orderId) || phoneDigits.length < 10) {
    return NextResponse.json({ error: "Invalid booking link." }, { status: 400 });
  }

  const ctx = await getOrderContext(orderId);
  const ownerDigits = ctx?.whatsapp_number.replace(/\D/g, "") || "";
  // Same response for "not found" and "not yours" so order ids cannot be probed.
  if (!ctx || !(ownerDigits === phoneDigits || ownerDigits.endsWith(phoneDigits.slice(-10)))) {
    return NextResponse.json({ error: "This booking link is invalid or has expired." }, { status: 404 });
  }

  const live = isLiveHold(ctx);
  return NextResponse.json(
    {
      success: true,
      order: {
        orderId: ctx.order_id,
        serviceCode: ctx.service_code,
        serviceTitle: ctx.service_title,
        amount: ctx.total_amount_inr,
        participants: ctx.participants_count,
        customerName: ctx.full_name,
        hasRegistration: ctx.has_registration,
      },
      slot: ctx.booking
        ? {
            slotId: ctx.booking.slot_id,
            date: ctx.booking.slot_date,
            displayDate: ctx.booking.display_date,
            startTime: ctx.booking.start_time,
            endTime: ctx.booking.end_time,
            status: live ? ctx.booking.booking_status : "EXPIRED",
            isFuture: ctx.booking.is_future,
            holdExpiresAt: live ? ctx.booking.hold_expires_at : null,
          }
        : null,
      paid: ctx.paid
        ? {
            receiptNumber: ctx.paid.receipt_number,
            gatewayRef: ctx.paid.gateway_payment_id,
            amount: ctx.paid.amount_inr,
            paidAt: ctx.paid.paid_at,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

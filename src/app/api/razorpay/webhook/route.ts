import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { finalizeRazorpayPayment } from "@/lib/payments";
import { verifyWebhookSignature } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════
// Razorpay server-to-server webhook (safety net).
// Confirms bookings even if the customer closes the browser before
// /api/verify-payment runs. Configure in Razorpay Dashboard → Webhooks:
//   URL:    <NEXT_PUBLIC_APP_URL>/api/payments/webhook  (Razorpay rejects URLs containing "razorpay")
//   Secret: RAZORPAY_WEBHOOK_SECRET
//   Events: payment.captured, order.paid, payment.failed
// Finalisation is idempotent, so a webhook racing the browser never double-sends.
// ═══════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const payment = event?.payload?.payment?.entity;
  const rzpOrderId: string | undefined = payment?.order_id || event?.payload?.order?.entity?.id;

  try {
    if ((event.event === "payment.captured" || event.event === "order.paid") && rzpOrderId && payment?.id) {
      const result = await finalizeRazorpayPayment({ razorpayOrderId: rzpOrderId, razorpayPaymentId: payment.id });
      if (!result.ok) console.warn(`[razorpay-webhook] no GEC booking for Razorpay order ${rzpOrderId}`);
    } else if (event.event === "payment.failed" && rzpOrderId) {
      const reason = [payment?.error_code, payment?.error_description].filter(Boolean).join(": ").slice(0, 500);
      await query(
        `UPDATE payments SET failure_reason = $2, updated_at = CURRENT_TIMESTAMP
         WHERE gateway_order_id = $1 AND payment_status <> 'PAID';`,
        [rzpOrderId, reason || "payment.failed"]
      );
    }
  } catch (err) {
    console.error("[razorpay-webhook] processing error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 }); // Razorpay retries non-2xx
  }

  return NextResponse.json({ received: true });
}

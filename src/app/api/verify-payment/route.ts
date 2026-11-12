import { NextRequest, NextResponse } from "next/server";
import { finalizeRazorpayPayment } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { verifyPaymentSignature } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════
// STEP 3 — Verify the Razorpay checkout signature, then finalise the order.
// signature = HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, KEY_SECRET)
// Nothing is marked PAID unless the signature matches AND Razorpay confirms
// the payment is captured for the right order and amount.
// ═══════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const wait = rateLimit(`verify:${clientIp(req)}`, 30, 10 * 60 * 1000);
  if (wait) {
    return NextResponse.json({ success: false, error: "Too many attempts. Please wait and try again." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const razorpay_order_id = String(body.razorpay_order_id || "").trim();
  const razorpay_payment_id = String(body.razorpay_payment_id || "").trim();
  const razorpay_signature = String(body.razorpay_signature || "").trim();

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ success: false, error: "Missing payment verification fields." }, { status: 400 });
  }

  if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    console.warn(`[verify-payment] signature mismatch for ${razorpay_order_id} / ${razorpay_payment_id}`);
    return NextResponse.json(
      { success: false, error: "Payment could not be verified. If money was deducted, it will be refunded automatically." },
      { status: 400 }
    );
  }

  try {
    const result = await finalizeRazorpayPayment({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });
    if (!result.ok) {
      const message =
        result.reason === "PAYMENT_MISMATCH"
          ? "Your payment was received but needs a quick manual check. Our team will contact you shortly — no need to pay again."
          : result.reason === "PAYMENT_NOT_CAPTURED"
          ? "Your bank has not completed this payment yet. If money was deducted, it will be confirmed or refunded automatically."
          : "Booking for this payment was not found. Our team has been notified — no need to pay again.";
      return NextResponse.json({ success: false, error: message, code: result.reason }, { status: result.reason === "ORDER_NOT_FOUND" ? 404 : 409 });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[verify-payment] finalisation error:", err);
    return NextResponse.json(
      { success: false, error: "Payment received, but we could not confirm your booking yet. Our team will contact you shortly — no need to pay again." },
      { status: 500 }
    );
  }
}

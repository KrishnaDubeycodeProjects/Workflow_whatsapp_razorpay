import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════
// RETIRED: this endpoint used to mark orders PAID without any real payment.
// Payments now go through Razorpay Standard Checkout:
//   POST /api/create-order    → Razorpay order (server-priced)
//   POST /api/verify-payment  → signature check, then finalisation
//   POST /api/razorpay/webhook → server-to-server safety net
// ═══════════════════════════════════════════════════════════════════
export async function POST() {
  return NextResponse.json(
    { error: "This checkout endpoint has been retired. Please use the payment button on the checkout page." },
    { status: 410 }
  );
}

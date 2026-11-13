import { NextRequest, NextResponse } from "next/server";
import { nameError } from "@/lib/validation";
import { query } from "@/lib/db";
import {
  extendHold,
  getOrderContext,
  holdSlot,
  HOLD_MINUTES_PAYMENT,
  HOLD_MINUTES_REGISTRATION,
  isLiveHold,
  normalizePhone,
  registerUrl,
  UUID_RE,
} from "@/lib/booking";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { describeRazorpayError, getRazorpay, getRazorpayKeyId, RAZORPAY_MIN_AMOUNT_PAISE } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://goraiequestriancentre.vercel.app";

// ═══════════════════════════════════════════════════════════════════
// STEP 1 — Create a Razorpay order for a GEC booking.
// Gates, in order (each failure returns a machine-readable `code`):
//   • valid name / Indian mobile                         → 400
//   • booking link belongs to this WhatsApp number       → 403 ORDER_OWNER_MISMATCH
//   • already paid                                       → 200 alreadyPaid (no charge)
//   • the order holds a future slot (re-acquired if its hold expired,
//     or a new slot chosen on the website)               → 409 SLOT_REQUIRED / SLOT_UNAVAILABLE
//   • rider waiver signed                                → 409 REGISTRATION_REQUIRED (slot stays held)
// Price always comes from the services table; the hold is extended for the
// payment window so the cleanup job cannot release it mid-checkout.
// ═══════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const wait = rateLimit(`create-order:${clientIp(req)}`, 20, 10 * 60 * 1000);
  if (wait) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429, headers: { "Retry-After": String(wait) } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { serviceCode, customerName, whatsappNumber, participantsCount, orderId: passedOrderId, slotId } = body;

    const name = String(customerName || "").trim().replace(/\s+/g, " ");
    const nameProblem = nameError(name, "full name");
    if (nameProblem) {
      return NextResponse.json({ error: nameProblem, code: "BAD_NAME" }, { status: 400 });
    }
    if (passedOrderId && !UUID_RE.test(String(passedOrderId))) {
      return NextResponse.json({ error: "Invalid booking reference. Please restart checkout.", code: "BAD_ORDER" }, { status: 400 });
    }
    if (slotId && !UUID_RE.test(String(slotId))) {
      return NextResponse.json({ error: "Invalid time slot. Please pick again.", code: "SLOT_REQUIRED" }, { status: 400 });
    }
    const count = Math.min(10, Math.max(1, parseInt(participantsCount || "1", 10) || 1));

    // 1. Existing booking (from WhatsApp or a previous attempt): ownership + already-paid checks.
    let ctx = passedOrderId ? await getOrderContext(String(passedOrderId)) : null;
    if (passedOrderId && !ctx) {
      return NextResponse.json({ error: "This booking link has expired. Please start a new booking.", code: "ORDER_NOT_FOUND" }, { status: 404 });
    }
    // WhatsApp customers may have non-Indian numbers: an exact match with the order's own number is accepted.
    const providedDigits = String(whatsappNumber || "").replace(/\D/g, "");
    const cleanPhone =
      ctx && ctx.whatsapp_number.replace(/\D/g, "") === providedDigits ? ctx.whatsapp_number : normalizePhone(whatsappNumber);
    if (!cleanPhone) {
      return NextResponse.json({ error: "Please provide a valid 10-digit Indian mobile number." }, { status: 400 });
    }
    if (ctx && ctx.whatsapp_number !== cleanPhone) {
      return NextResponse.json(
        { error: "This booking link belongs to a different WhatsApp number.", code: "ORDER_OWNER_MISMATCH" },
        { status: 403 }
      );
    }
    if (ctx?.paid) {
      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        orderId: ctx.order_id,
        receiptNumber: ctx.paid.receipt_number,
        gatewayRef: ctx.paid.gateway_payment_id,
        amount: ctx.paid.amount_inr,
        serviceTitle: ctx.service_title,
        paidAt: ctx.paid.paid_at,
      });
    }

    // 2. Server-verified price. An existing order keeps its service (locked plan).
    const effectiveService = ctx ? ctx.service_code : String(serviceCode || "");
    const serviceRes = await query(
      `SELECT service_id, service_code, title, price_inr FROM services WHERE service_code = $1 AND is_active = true;`,
      [effectiveService]
    );
    if (!serviceRes.rowCount) {
      return NextResponse.json({ error: "Selected service is not available right now.", code: "SERVICE_UNAVAILABLE" }, { status: 404 });
    }
    const service = serviceRes.rows[0];
    const unitPrice = parseFloat(service.price_inr);
    const totalAmount = unitPrice * count;
    const amountPaise = Math.round(totalAmount * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < RAZORPAY_MIN_AMOUNT_PAISE) {
      return NextResponse.json({ error: "Order amount must be at least ₹1." }, { status: 400 });
    }

    // 3. Customer + order (new orders only come from the website).
    const custRes = await query(
      `INSERT INTO customers (whatsapp_number, full_name)
       VALUES ($1, $2)
       ON CONFLICT (whatsapp_number) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = CURRENT_TIMESTAMP
       RETURNING customer_id;`,
      [cleanPhone, name]
    );
    const customerId: string = custRes.rows[0].customer_id;

    let orderId: string;
    if (ctx) {
      orderId = ctx.order_id;
      await query(
        `UPDATE selected_services
         SET service_id = $2, service_title = $3, participants_count = $4, unit_price_inr = $5, total_amount_inr = $6
         WHERE order_id = $1::uuid;`,
        [orderId, service.service_id, service.title, count, unitPrice, totalAmount]
      );
    } else {
      const orderRes = await query(
        `INSERT INTO selected_services (customer_id, service_id, service_code, service_title, participants_count, unit_price_inr, total_amount_inr)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING order_id;`,
        [customerId, service.service_id, service.service_code, service.title, count, unitPrice, totalAmount]
      );
      orderId = orderRes.rows[0].order_id;
      ctx = await getOrderContext(orderId);
    }
    if (!ctx) throw new Error("order context vanished");

    // 4. Slot: keep the live hold, take the newly chosen slot, or re-acquire an expired one.
    const holdStatus = ctx.has_registration ? "PENDING_PAYMENT" : "PENDING_REGISTRATION";
    const holdMinutes = ctx.has_registration ? HOLD_MINUTES_PAYMENT : HOLD_MINUTES_REGISTRATION;
    const wantedSlot: string | null = slotId ? String(slotId) : ctx.booking?.is_future ? ctx.booking.slot_id : null;
    let slotInfo: { displayDate: string; startTime: string; endTime: string; holdExpiresAt?: string } | null = null;

    if (!slotId && isLiveHold(ctx) && ctx.booking?.is_future) {
      await extendHold(orderId, holdMinutes, ctx.has_registration ? "PENDING_PAYMENT" : undefined);
      slotInfo = { displayDate: ctx.booking.display_date, startTime: ctx.booking.start_time, endTime: ctx.booking.end_time };
    } else if (wantedSlot) {
      const hold = await holdSlot({
        orderId,
        slotId: wantedSlot,
        customerId,
        riderName: name,
        serviceCode: service.service_code,
        whatsappNumber: cleanPhone,
        status: holdStatus,
        minutes: holdMinutes,
      });
      if (!hold.ok) {
        const msg =
          hold.reason === "SLOT_FULL"
            ? "Sorry, that time slot just filled up. Please choose another time."
            : hold.reason === "SLOT_IN_PAST"
            ? "That time slot has already started. Please choose another time."
            : "That time slot is no longer available. Please choose another time.";
        return NextResponse.json({ error: msg, code: "SLOT_UNAVAILABLE", orderId }, { status: 409 });
      }
      slotInfo = { displayDate: hold.displayDate, startTime: hold.startTime, endTime: hold.endTime };
    } else {
      return NextResponse.json({ error: "Please choose a date and time for your ride.", code: "SLOT_REQUIRED", orderId }, { status: 409 });
    }

    if (slotInfo) slotInfo.holdExpiresAt = new Date(Date.now() + holdMinutes * 60_000).toISOString();

    // 5. Waiver gate (the slot stays held while the rider signs it).
    if (!ctx.has_registration) {
      return NextResponse.json(
        {
          error: "Please complete the rider safety waiver first. Your slot is held for 30 minutes.",
          code: "REGISTRATION_REQUIRED",
          orderId,
          registerUrl: registerUrl(APP_URL, { ...ctx, full_name: name }),
        },
        { status: 409 }
      );
    }

    // 6. Razorpay order (amount in paise).
    let rzpOrder;
    try {
      rzpOrder = await getRazorpay().orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt: orderId, // UUID = 36 chars (Razorpay limit is 40)
        notes: { gec_order_id: orderId, service_code: service.service_code },
      });
    } catch (err: any) {
      const { status, message } = describeRazorpayError(err);
      console.error("[create-order] Razorpay order creation failed:", message);
      return NextResponse.json({ error: status === 401 ? message : "Could not start payment. Please try again." }, { status });
    }

    // 7. One payments row per order: refresh the unpaid row, or create it as PENDING.
    const refreshed = await query(
      `UPDATE payments
       SET gateway_order_id = $2, amount_inr = $3, payment_status = 'PENDING', payment_gateway = 'Razorpay',
           customer_id = $4, failure_reason = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1::uuid AND payment_status <> 'PAID'
       RETURNING payment_id;`,
      [orderId, rzpOrder.id, totalAmount, customerId]
    );
    if (!refreshed.rowCount) {
      await query(
        `INSERT INTO payments (order_id, customer_id, amount_inr, currency, payment_status, payment_gateway, gateway_order_id, idempotency_key)
         VALUES ($1, $2, $3, 'INR', 'PENDING', 'Razorpay', $4, $5)
         ON CONFLICT (idempotency_key) DO UPDATE
         SET gateway_order_id = EXCLUDED.gateway_order_id, amount_inr = EXCLUDED.amount_inr, updated_at = CURRENT_TIMESTAMP
         WHERE payments.payment_status <> 'PAID';`,
        [orderId, customerId, totalAmount, rzpOrder.id, `rzp-order:${orderId}`]
      );
    }

    // 8. Let the WhatsApp side know the customer is paying (keeps the session from being reset).
    await query(
      `UPDATE conversations
       SET current_state = 'PAYMENT_PENDING', active_order_id = $2::uuid, updated_at = CURRENT_TIMESTAMP
       WHERE session_id = $1 AND current_state <> 'PAYMENT_SUCCESS';`,
      [`wa_${cleanPhone.replace(/\D/g, "")}`, orderId]
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key_id: getRazorpayKeyId(), // public key only — the secret never leaves the server
      gecOrderId: orderId,
      serviceTitle: service.title,
      slot: slotInfo,
      prefill: { name, contact: cleanPhone },
    });
  } catch (err: any) {
    console.error("[create-order] error:", err);
    return NextResponse.json({ error: "Unable to start checkout. Please try again." }, { status: 500 });
  }
}

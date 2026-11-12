import crypto from "crypto";
import { query } from "@/lib/db";
import { getOrderContext, holdSlot, HOLD_MINUTES_PAYMENT, isLiveHold, UUID_RE } from "@/lib/booking";
import { postToN8n } from "@/lib/n8n";
import { getRazorpay } from "@/lib/razorpay";
import { sendButtonMessage, sendDocumentMessage, sendTextMessage } from "@/lib/whatsapp";

export { UUID_RE };

// ═══════════════════════════════════════════════════════════════════
// PAYMENT FINALISATION — EXACTLY ONCE, NEVER LOSES MONEY
// Called after Razorpay has proven a payment (checkout signature or signed
// webhook). Steps:
//   1. Map the Razorpay order to the GEC order (by gateway_order_id, or via the
//      Razorpay order's notes when the customer paid an older order/tab).
//   2. Re-check the payment with Razorpay: right order, right amount, captured
//      (captures it if the account is on manual capture).
//   3. Make sure the order still owns its slot (re-acquire an expired hold).
//   4. n8n flips PENDING → PAID and sends the WhatsApp receipt; if n8n fails,
//      the portal does it, guarded by WHERE payment_status <> 'PAID'.
//   5. Anything that cannot be resolved automatically (slot gone, amount
//      mismatch) is still recorded and handed to staff — never silently dropped.
// ═══════════════════════════════════════════════════════════════════
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://goraiequestriancentre.vercel.app";

export async function findPaidPayment(orderId: string) {
  const r = await query(
    `SELECT payment_id, receipt_number, paid_at, amount_inr, gateway_payment_id
     FROM payments
     WHERE order_id = $1::uuid AND payment_status = 'PAID'
     ORDER BY paid_at ASC NULLS LAST
     LIMIT 1;`,
    [orderId]
  );
  return r.rows[0] || null;
}

/** Puts the conversation in front of staff with an explanatory note in the admin chat. */
export async function flagForStaff(customerId: string, whatsappNumber: string, note: string) {
  try {
    const sessionId = `wa_${String(whatsappNumber).replace(/\D/g, "")}`;
    const conv = await query(
      `INSERT INTO conversations (customer_id, session_id, current_state, control_mode, current_intent)
       VALUES ($1, $2, 'PAYMENT_SUCCESS', 'HUMAN_HANDOVER', 'staff_attention')
       ON CONFLICT (session_id) DO UPDATE
       SET control_mode = 'HUMAN_HANDOVER', current_intent = 'staff_attention', updated_at = CURRENT_TIMESTAMP
       RETURNING conversation_id;`,
      [customerId, sessionId]
    );
    await query(
      `INSERT INTO messages (conversation_id, customer_id, direction, message_type, content, sender)
       VALUES ($1, $2, 'OUTBOUND', 'system_alert', $3, 'system');`,
      [conv.rows[0].conversation_id, customerId, `⚠️ ACTION NEEDED: ${note}`]
    );
  } catch (err) {
    console.error("[payments] flagForStaff failed:", err, note);
  }
}

async function sendDirectPaymentReceipt(p: {
  phone: string;
  orderId: string;
  receiptNumber: string;
  amount: number;
  customerName: string;
  serviceTitle: string;
  schedule: string | null;
}) {
  const to = p.phone.replace(/\D/g, "");
  const amountStr = Number(p.amount || 0).toLocaleString("en-IN");
  await sendDocumentMessage(
    to,
    `${APP_URL}/api/receipt/pdf?orderId=${encodeURIComponent(p.orderId)}&receipt=${encodeURIComponent(p.receiptNumber)}`,
    `GEC_Receipt_${p.receiptNumber}.pdf`,
    `🧾 Official GEC Tax Invoice Slip: ${p.receiptNumber} | Paid: ₹${amountStr}`
  );
  await sendButtonMessage(
    to,
    `Thank you for booking with *Gorai Equestrian Centre*! 🐎\n\n• 🧾 Receipt No: *${p.receiptNumber}*\n• 👤 Rider: *${p.customerName}*\n• 🎟️ Experience: *${p.serviceTitle}*\n${p.schedule ? `• 📆 Schedule: *${p.schedule}*\n` : ""}• 💳 Amount Paid: *₹${amountStr}*\n\n📍 Location: Khajuriwadi, Gorai, Mumbai\n👤 Support: *+91 93220 13233* (Salma) / *+91 90219 39252* (Anushka)\n\nPlease arrive 15 minutes early in closed shoes and full-length trousers. Tap below for directions or photos!`,
    [
      { id: "btn_location", title: "📍 Get Location" },
      { id: "btn_media", title: "🖼️ View Photos" },
      { id: "btn_handover", title: "👤 Contact Staff" },
    ],
    "✅ Booking Confirmed",
    "GEC Official Desk"
  );
}

export type FinalizeResult =
  | { ok: false; reason: "ORDER_NOT_FOUND" | "PAYMENT_NOT_CAPTURED" | "PAYMENT_MISMATCH" }
  | {
      ok: true;
      alreadyPaid: boolean;
      orderId: string;
      receiptNumber: string;
      gatewayRef: string;
      amount: number;
      serviceTitle: string;
      paidAt: string;
      schedule: string | null;
      needsStaff: boolean;
    };

type PaymentRow = {
  payment_id: string;
  order_id: string;
  customer_id: string;
  payment_status: string;
  amount_inr: string;
  gateway_order_id: string | null;
};

async function findPaymentRow(razorpayOrderId: string): Promise<{ row: PaymentRow | null; rzpOrderAmount: number | null }> {
  const direct = await query(
    `SELECT payment_id, order_id, customer_id, payment_status, amount_inr, gateway_order_id
     FROM payments WHERE gateway_order_id = $1 LIMIT 1;`,
    [razorpayOrderId]
  );
  if (direct.rowCount) return { row: direct.rows[0], rzpOrderAmount: null };

  // Customer paid an older Razorpay order for the same booking (second tab, re-priced order...).
  const rzpOrder: any = await getRazorpay().orders.fetch(razorpayOrderId);
  const gecOrderId = String(rzpOrder?.notes?.gec_order_id || rzpOrder?.receipt || "");
  if (!UUID_RE.test(gecOrderId)) return { row: null, rzpOrderAmount: null };
  const byOrder = await query(
    `SELECT payment_id, order_id, customer_id, payment_status, amount_inr, gateway_order_id
     FROM payments WHERE order_id = $1::uuid
     ORDER BY (payment_status = 'PAID') DESC, updated_at DESC NULLS LAST LIMIT 1;`,
    [gecOrderId]
  );
  return { row: byOrder.rows[0] || null, rzpOrderAmount: Number(rzpOrder.amount) };
}

export async function finalizeRazorpayPayment(p: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string | null;
}): Promise<FinalizeResult> {
  // 1. Which GEC order is this?
  const { row, rzpOrderAmount } = await findPaymentRow(p.razorpayOrderId);
  if (!row) {
    console.error(`[payments] Razorpay order ${p.razorpayOrderId} (payment ${p.razorpayPaymentId}) has no GEC booking`);
    return { ok: false, reason: "ORDER_NOT_FOUND" };
  }
  const ctx = await getOrderContext(row.order_id);
  if (!ctx) return { ok: false, reason: "ORDER_NOT_FOUND" };

  const scheduleOf = (c: typeof ctx) =>
    c.booking && c.booking.booking_status !== "EXPIRED" ? `${c.booking.display_date}, ${c.booking.start_time}` : null;

  if (ctx.paid) {
    if (ctx.paid.gateway_payment_id && ctx.paid.gateway_payment_id !== p.razorpayPaymentId) {
      // A second, different payment for an already-paid booking: money must go back.
      await flagForStaff(
        ctx.customer_id,
        ctx.whatsapp_number,
        `Duplicate payment ${p.razorpayPaymentId} received for already-paid order ${ctx.order_id} (receipt ${ctx.paid.receipt_number}). Refund it from the Razorpay dashboard.`
      );
    }
    return {
      ok: true,
      alreadyPaid: true,
      orderId: ctx.order_id,
      receiptNumber: ctx.paid.receipt_number,
      gatewayRef: ctx.paid.gateway_payment_id,
      amount: ctx.paid.amount_inr,
      serviceTitle: ctx.service_title,
      paidAt: ctx.paid.paid_at,
      schedule: scheduleOf(ctx),
      needsStaff: false,
    };
  }

  // 2. Re-check with Razorpay (defence in depth + capture on manual-capture accounts).
  const expectedPaise = Math.round(Number(row.amount_inr) * 100);
  let payment: any = await getRazorpay().payments.fetch(p.razorpayPaymentId);
  if (payment.order_id !== p.razorpayOrderId) return { ok: false, reason: "PAYMENT_MISMATCH" };
  if (payment.status === "authorized") {
    payment = await getRazorpay().payments.capture(p.razorpayPaymentId, payment.amount, payment.currency || "INR");
  }
  if (payment.status !== "captured") return { ok: false, reason: "PAYMENT_NOT_CAPTURED" };

  if (Number(payment.amount) !== expectedPaise) {
    // Paid an older order whose amount differs from the current price: keep the money traceable, let staff decide.
    await flagForStaff(
      ctx.customer_id,
      ctx.whatsapp_number,
      `Payment ${p.razorpayPaymentId} of ₹${Number(payment.amount) / 100} does not match the current amount ₹${expectedPaise / 100} for order ${ctx.order_id} (${ctx.service_title}). Confirm or refund manually.`
    );
    await query(
      `UPDATE payments SET failure_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE payment_id = $1 AND payment_status <> 'PAID';`,
      [row.payment_id, `AMOUNT_MISMATCH: paid ${payment.amount} paise via ${p.razorpayPaymentId}`]
    );
    return { ok: false, reason: "PAYMENT_MISMATCH" };
  }
  if (rzpOrderAmount !== null || row.gateway_order_id !== p.razorpayOrderId) {
    await query(`UPDATE payments SET gateway_order_id = $2 WHERE payment_id = $1 AND payment_status <> 'PAID';`, [
      row.payment_id,
      p.razorpayOrderId,
    ]);
  }

  // 3. The order must own a slot before it is confirmed.
  let slotProblem: string | null = null;
  if (!isLiveHold(ctx)) {
    if (ctx.booking && ctx.booking.is_future) {
      const hold = await holdSlot({
        orderId: ctx.order_id,
        slotId: ctx.booking.slot_id,
        customerId: ctx.customer_id,
        riderName: ctx.full_name,
        serviceCode: ctx.service_code,
        whatsappNumber: ctx.whatsapp_number,
        status: "PENDING_PAYMENT",
        minutes: HOLD_MINUTES_PAYMENT,
      });
      if (!hold.ok) slotProblem = `the held slot ${ctx.booking.display_date} ${ctx.booking.start_time} was released and is now ${hold.reason}`;
    } else {
      slotProblem = ctx.booking ? "the chosen slot is already in the past" : "no riding slot was chosen";
    }
  }

  // 4a. Preferred path: n8n flips the PENDING row to PAID and sends the receipt.
  let notifiedBy: "n8n" | "direct" | "none" = "none";
  const n8n = await postToN8n(process.env.N8N_PAYMENT_WEBHOOK_URL, {
    order_id: ctx.order_id,
    orderId: ctx.order_id,
    paymentId: p.razorpayPaymentId,
    gateway_payment_id: p.razorpayPaymentId,
    paymentGateway: "Razorpay",
    razorpay_order_id: p.razorpayOrderId,
  });
  if (!n8n.ok || !n8n.json?.success) console.error(`[payments] n8n payment webhook failed: HTTP ${n8n.status}`, n8n.json);
  let paid = await findPaidPayment(ctx.order_id);
  if (n8n.ok && n8n.json?.success && paid) notifiedBy = "n8n";

  // 4b. Fallback: flip it here; only the request that flipped it notifies.
  if (!paid) {
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const receiptNumber = `REC-${todayStr}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const upd = await query(
      `UPDATE payments
       SET payment_status = 'PAID', payment_gateway = 'Razorpay', gateway_payment_id = $2,
           receipt_number = COALESCE(receipt_number, $3), paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
           failure_reason = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE payment_id = $1 AND payment_status <> 'PAID'
       RETURNING payment_id, receipt_number, paid_at, amount_inr, gateway_payment_id;`,
      [row.payment_id, p.razorpayPaymentId, receiptNumber]
    );
    if (upd.rowCount) {
      paid = upd.rows[0];
      await query(
        `UPDATE slot_bookings SET booking_status = 'CONFIRMED', hold_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1::uuid AND booking_status IN ('PENDING_REGISTRATION', 'PENDING_PAYMENT');`,
        [ctx.order_id]
      ).catch((err) => console.error("[payments] slot confirmation failed:", err));
      await query(
        `UPDATE conversations SET current_state = 'PAYMENT_SUCCESS', updated_at = CURRENT_TIMESTAMP WHERE customer_id = $1;`,
        [ctx.customer_id]
      ).catch(() => {});
      try {
        const fresh = await getOrderContext(ctx.order_id);
        await sendDirectPaymentReceipt({
          phone: ctx.whatsapp_number,
          orderId: ctx.order_id,
          receiptNumber: paid.receipt_number,
          amount: Number(paid.amount_inr),
          customerName: ctx.full_name,
          serviceTitle: ctx.service_title,
          schedule: fresh ? scheduleOf(fresh) : null,
        });
        notifiedBy = "direct";
      } catch (err) {
        console.error("[payments] direct WhatsApp receipt failed:", err);
      }
    } else {
      paid = await findPaidPayment(ctx.order_id); // a concurrent call (verify vs webhook) won the race
    }
  }
  if (!paid) throw new Error(`Payment row missing for order ${ctx.order_id} after n8n + direct attempts`);

  // Keep the gateway proof on the row (n8n does not store it).
  await query(
    `UPDATE payments SET gateway_order_id = $2, gateway_signature = COALESCE($3, gateway_signature) WHERE payment_id = $1;`,
    [paid.payment_id, p.razorpayOrderId, p.razorpaySignature || null]
  ).catch((err) => console.error("[payments] storing gateway proof failed:", err));

  // 5. Audit trail + staff escalation (only the call that actually just paid gets here with notifiedBy set).
  if (notifiedBy !== "none") {
    await query(
      `INSERT INTO messages (conversation_id, customer_id, direction, message_type, content, sender)
       SELECT conversation_id, customer_id, 'OUTBOUND', 'payment_receipt', $2, 'bot'
       FROM conversations WHERE customer_id = $1 ORDER BY updated_at DESC LIMIT 1;`,
      [
        ctx.customer_id,
        `Payment Confirmed (Razorpay ${p.razorpayPaymentId}): ${ctx.service_title} | ₹${Number(paid.amount_inr).toLocaleString("en-IN")} | Receipt ${paid.receipt_number} | receipt via ${notifiedBy}`,
      ]
    ).catch(() => {});
    if (slotProblem) {
      await flagForStaff(
        ctx.customer_id,
        ctx.whatsapp_number,
        `Order ${ctx.order_id} is PAID (receipt ${paid.receipt_number}) but ${slotProblem}. Call the rider to schedule a time.`
      );
      await sendTextMessage(
        ctx.whatsapp_number.replace(/\D/g, ""),
        "✅ Your payment is confirmed.\n\n⚠️ Your selected time slot was released before payment completed. Our team will contact you shortly to fix a riding time. Need help now? Call +91 93220 13233."
      ).catch(() => {});
    }
  }

  const finalCtx = await getOrderContext(ctx.order_id);
  return {
    ok: true,
    alreadyPaid: false,
    orderId: ctx.order_id,
    receiptNumber: paid.receipt_number,
    gatewayRef: paid.gateway_payment_id || p.razorpayPaymentId,
    amount: Number(paid.amount_inr),
    serviceTitle: ctx.service_title,
    paidAt: paid.paid_at,
    schedule: finalCtx ? scheduleOf(finalCtx) : null,
    needsStaff: Boolean(slotProblem),
  };
}

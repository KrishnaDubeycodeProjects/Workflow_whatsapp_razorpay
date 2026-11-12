import { query } from "@/lib/db";

// ═══════════════════════════════════════════════════════════════════
// Booking domain rules shared by the website APIs. The n8n workflow uses
// the same SQL patterns, so WhatsApp and web can never double-book.
//
// Slot hold lifecycle (slot_bookings.booking_status):
//   PENDING_REGISTRATION ─(waiver)→ PENDING_PAYMENT ─(paid)→ CONFIRMED
//          └────────────(hold_expires_at passed)────────────→ EXPIRED
// time_slots.booked_count counts PENDING_* + CONFIRMED rows. It is only ever
// changed in the same statement that locks the slot row (FOR UPDATE).
// ═══════════════════════════════════════════════════════════════════

export const HOLD_MINUTES_REGISTRATION = 30; // time to fill the waiver
export const HOLD_MINUTES_PAYMENT = 30; // time to complete Razorpay checkout
export const BOOKING_WINDOW_DAYS = 30; // matches the 30 days of slots n8n keeps generated
const LIVE = ["PENDING_REGISTRATION", "PENDING_PAYMENT", "CONFIRMED"];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizePhone(input: unknown): string | null {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1))) return `+91${digits.slice(1)}`;
  return null;
}

export type OrderContext = {
  order_id: string;
  customer_id: string;
  whatsapp_number: string;
  full_name: string;
  service_code: string;
  service_title: string;
  participants_count: number;
  total_amount_inr: number;
  registration_id: string | null;
  has_registration: boolean;
  paid: { receipt_number: string; paid_at: string; amount_inr: number; gateway_payment_id: string } | null;
  booking: {
    booking_id: string;
    slot_id: string;
    booking_status: string;
    hold_expires_at: string | null;
    slot_date: string;
    display_date: string;
    start_time: string;
    end_time: string;
    is_future: boolean;
  } | null;
};

/** Everything the website needs to know about an order, in one round-trip. */
export async function getOrderContext(orderId: string): Promise<OrderContext | null> {
  if (!UUID_RE.test(orderId)) return null;
  const r = await query(
    `SELECT o.order_id, o.customer_id, c.whatsapp_number, c.full_name, o.service_code, o.service_title,
            o.participants_count, o.total_amount_inr, o.registration_id,
            EXISTS (SELECT 1 FROM registrations r WHERE r.customer_id = o.customer_id AND r.status IN ('COMPLETED','VERIFIED')) AS has_registration,
            (SELECT row_to_json(p) FROM (
               SELECT receipt_number, paid_at, amount_inr, gateway_payment_id FROM payments
               WHERE order_id = o.order_id AND payment_status = 'PAID' ORDER BY paid_at ASC NULLS LAST LIMIT 1) p) AS paid,
            (SELECT row_to_json(b) FROM (
               SELECT sb.booking_id, sb.slot_id, sb.booking_status, sb.hold_expires_at,
                      to_char(ts.slot_date, 'YYYY-MM-DD') AS slot_date,
                      to_char(ts.slot_date, 'Dy, DD Mon YYYY') AS display_date,
                      to_char(ts.start_time, 'HH12:MI AM') AS start_time,
                      to_char(ts.end_time, 'HH12:MI AM') AS end_time,
                      (ts.slot_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
                        OR (ts.slot_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
                            AND ts.start_time > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time)) AS is_future
               FROM slot_bookings sb JOIN time_slots ts ON ts.slot_id = sb.slot_id
               WHERE sb.order_id = o.order_id
               ORDER BY CASE sb.booking_status WHEN 'CONFIRMED' THEN 0 WHEN 'PENDING_PAYMENT' THEN 1
                                               WHEN 'PENDING_REGISTRATION' THEN 2 ELSE 3 END,
                        sb.updated_at DESC NULLS LAST, sb.created_at DESC
               LIMIT 1) b) AS booking
     FROM selected_services o
     JOIN customers c ON c.customer_id = o.customer_id
     WHERE o.order_id = $1::uuid;`,
    [orderId]
  );
  if (!r.rowCount) return null;
  const row = r.rows[0];
  return {
    ...row,
    participants_count: Number(row.participants_count || 1),
    total_amount_inr: Number(row.total_amount_inr),
    paid: row.paid ? { ...row.paid, amount_inr: Number(row.paid.amount_inr) } : null,
  };
}

/** Is this booking row currently holding (or owning) its slot? */
export function isLiveHold(ctx: OrderContext): boolean {
  if (!ctx.booking) return false;
  if (ctx.booking.booking_status === "CONFIRMED") return true;
  if (!LIVE.includes(ctx.booking.booking_status)) return false;
  return !ctx.booking.hold_expires_at || new Date(ctx.booking.hold_expires_at).getTime() > Date.now();
}

export type HoldResult =
  | { ok: true; bookingId: string; slotId: string; displayDate: string; startTime: string; endTime: string }
  | { ok: false; reason: "SLOT_NOT_FOUND" | "SLOT_IN_PAST" | "SLOT_FULL" };

/**
 * Atomically (re)acquires a hold on `slotId` for an order and releases any other
 * unpaid hold the order had. Safe under concurrency: the slot row is locked and
 * capacity is checked against the freshly locked booked_count.
 */
export async function holdSlot(p: {
  orderId: string;
  slotId: string;
  customerId: string;
  riderName: string;
  serviceCode: string;
  whatsappNumber: string;
  status: "PENDING_REGISTRATION" | "PENDING_PAYMENT";
  minutes: number;
}): Promise<HoldResult> {
  if (!UUID_RE.test(p.slotId)) return { ok: false, reason: "SLOT_NOT_FOUND" };
  const r = await query(
    `WITH target_slot AS (
       SELECT slot_id, slot_date, start_time, end_time, max_capacity, booked_count, is_available
       FROM time_slots WHERE slot_id = $2::uuid
       FOR UPDATE
     ),
     existing AS (
       SELECT booking_status FROM slot_bookings WHERE order_id = $1::uuid AND slot_id = $2::uuid
     ),
     allowed AS (
       SELECT ts.*,
              COALESCE((SELECT booking_status IN ('PENDING_REGISTRATION','PENDING_PAYMENT','CONFIRMED') FROM existing), FALSE) AS already_live,
              (ts.slot_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
                OR (ts.slot_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
                    AND ts.start_time > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time)) AS is_future
       FROM target_slot ts
     ),
     decision AS (
       SELECT a.*, (a.is_future AND (a.already_live OR (a.is_available AND a.booked_count < a.max_capacity))) AS can_hold
       FROM allowed a
     ),
     upsert AS (
       INSERT INTO slot_bookings (slot_id, customer_id, order_id, rider_name, service_code, booking_status,
                                  whatsapp_number, hold_expires_at, updated_at)
       SELECT d.slot_id, $3::uuid, $1::uuid, $4, $5, $6, $7,
              CURRENT_TIMESTAMP + make_interval(mins => $8::int), CURRENT_TIMESTAMP
       FROM decision d WHERE d.can_hold
       ON CONFLICT (order_id, slot_id) DO UPDATE
         SET booking_status = CASE WHEN slot_bookings.booking_status = 'CONFIRMED' THEN 'CONFIRMED' ELSE EXCLUDED.booking_status END,
             hold_expires_at = EXCLUDED.hold_expires_at,
             customer_id = EXCLUDED.customer_id,
             whatsapp_number = EXCLUDED.whatsapp_number,
             rider_name = COALESCE(EXCLUDED.rider_name, slot_bookings.rider_name),
             updated_at = CURRENT_TIMESTAMP
       RETURNING booking_id
     ),
     bump AS (
       UPDATE time_slots ts
       SET booked_count = ts.booked_count + 1,
           is_available = (ts.booked_count + 1) < ts.max_capacity
       FROM decision d
       WHERE ts.slot_id = d.slot_id AND d.can_hold AND NOT d.already_live
       RETURNING ts.slot_id
     ),
     released AS (
       DELETE FROM slot_bookings
       WHERE order_id = $1::uuid AND slot_id <> $2::uuid
         AND booking_status IN ('PENDING_REGISTRATION','PENDING_PAYMENT','EXPIRED')
         AND EXISTS (SELECT 1 FROM decision WHERE can_hold)
       RETURNING slot_id, booking_status
     ),
     restore AS (
       UPDATE time_slots ts
       SET booked_count = GREATEST(0, ts.booked_count - r.n), is_available = TRUE
       FROM (SELECT slot_id, COUNT(*)::int AS n FROM released WHERE booking_status <> 'EXPIRED' GROUP BY slot_id) r
       WHERE ts.slot_id = r.slot_id
       RETURNING ts.slot_id
     )
     SELECT d.can_hold, d.is_future,
            to_char(d.slot_date, 'Dy, DD Mon YYYY') AS display_date,
            to_char(d.start_time, 'HH12:MI AM') AS start_time,
            to_char(d.end_time, 'HH12:MI AM') AS end_time,
            (SELECT booking_id FROM upsert LIMIT 1) AS booking_id,
            (SELECT COUNT(*) FROM bump) + (SELECT COUNT(*) FROM restore) AS _touched
     FROM decision d;`,
    [p.orderId, p.slotId, p.customerId, p.riderName, p.serviceCode, p.status, p.whatsappNumber, p.minutes]
  );
  if (!r.rowCount) return { ok: false, reason: "SLOT_NOT_FOUND" };
  const row = r.rows[0];
  if (!row.can_hold) return { ok: false, reason: row.is_future ? "SLOT_FULL" : "SLOT_IN_PAST" };
  return {
    ok: true,
    bookingId: row.booking_id,
    slotId: p.slotId,
    displayDate: row.display_date,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

/** Pushes the expiry of the order's live (unpaid) hold forward and optionally advances its status. */
export async function extendHold(orderId: string, minutes: number, status?: "PENDING_PAYMENT"): Promise<boolean> {
  const r = await query(
    `UPDATE slot_bookings
     SET hold_expires_at = GREATEST(COALESCE(hold_expires_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP + make_interval(mins => $2::int)),
         booking_status = COALESCE($3, booking_status),
         updated_at = CURRENT_TIMESTAMP
     WHERE order_id = $1::uuid AND booking_status IN ('PENDING_REGISTRATION', 'PENDING_PAYMENT')
     RETURNING booking_id;`,
    [orderId, minutes, status || null]
  );
  return (r.rowCount || 0) > 0;
}

/** Public slot availability for the website picker (no customer data). */
export async function listAvailableSlots(date?: string) {
  const r = await query(
    `SELECT slot_id,
            to_char(slot_date, 'YYYY-MM-DD') AS slot_date,
            to_char(slot_date, 'Dy, DD Mon') AS display_date,
            to_char(start_time, 'HH12:MI AM') AS start_time,
            to_char(end_time, 'HH12:MI AM') AS end_time,
            batch_name,
            (max_capacity - booked_count) AS spots_left
     FROM time_slots
     WHERE is_available = TRUE
       AND booked_count < max_capacity
       AND slot_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + ($2::int - 1)
       AND (slot_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
            OR (slot_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
                AND start_time > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time))
       AND ($1::date IS NULL OR slot_date = $1::date)
     ORDER BY slot_date, start_time
     LIMIT 300;`,
    [date || null, BOOKING_WINDOW_DAYS]
  );
  return r.rows.map((s: any) => ({ ...s, spots_left: Number(s.spots_left) }));
}

/** Customer-facing link to the waiver form for an order. */
export function registerUrl(appUrl: string, ctx: Pick<OrderContext, "order_id" | "whatsapp_number" | "full_name" | "service_title">) {
  const q = new URLSearchParams({
    orderId: ctx.order_id,
    phone: ctx.whatsapp_number.replace(/\D/g, ""),
    name: ctx.full_name || "",
    service: ctx.service_title || "",
    next: "checkout",
  });
  return `${appUrl}/register?${q.toString()}`;
}

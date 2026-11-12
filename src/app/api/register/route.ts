import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { extendHold, getOrderContext, HOLD_MINUTES_PAYMENT, normalizePhone, UUID_RE } from "@/lib/booking";
import { postToN8n } from "@/lib/n8n";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendCtaUrlMessage } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://goraiequestriancentre.vercel.app";

// registrations.activity is a DB enum: map whatever the form / WhatsApp link sends onto it.
function toActivityEnum(input: unknown): "Riding Lessons" | "Jumping Lessons" | "Trail Ride" {
  const s = String(input || "").toLowerCase();
  if (/trail|beach|coastal/.test(s)) return "Trail Ride";
  if (/jump/.test(s)) return "Jumping Lessons";
  return "Riding Lessons";
}
function toLevelEnum(input: unknown): "Beginner" | "Intermediate" | "Advanced" {
  const s = String(input || "").toLowerCase();
  if (s.startsWith("adv")) return "Advanced";
  if (s.startsWith("int") || s.startsWith("exp")) return "Intermediate";
  return "Beginner";
}
function ageOn(dob: Date, today = new Date()): number {
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// ═══════════════════════════════════════════════════════════════════
// Rider registration & safety waiver.
// If it belongs to a booking (orderId), the booking must belong to the same
// WhatsApp number; the slot hold is advanced to PENDING_PAYMENT and extended,
// then n8n sends the payment link on WhatsApp (direct send only if n8n fails).
// The response tells the page where to go next (checkout).
// ═══════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const wait = rateLimit(`register:${clientIp(req)}`, 10, 10 * 60 * 1000);
  if (wait) return NextResponse.json({ error: "Too many submissions. Please wait a few minutes." }, { status: 429 });

  try {
    const data = await req.json().catch(() => ({}));
    const str = (v: unknown, max = 200) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

    const cleanFullName = str(data.fullName, 150);
    if (cleanFullName.length < 2) return NextResponse.json({ error: "Please provide a valid full name." }, { status: 400 });

    const orderId = UUID_RE.test(String(data.orderId || "")) ? String(data.orderId) : "";
    const ctx = orderId ? await getOrderContext(orderId) : null;
    if (orderId && !ctx) {
      return NextResponse.json({ error: "This booking link has expired. Please start a new booking on WhatsApp." }, { status: 404 });
    }

    const typedDigits = String(data.mobileNumber || "").replace(/\D/g, "");
    const cleanMobile =
      ctx && ctx.whatsapp_number.replace(/\D/g, "") === typedDigits ? ctx.whatsapp_number : normalizePhone(data.mobileNumber);
    if (!cleanMobile) return NextResponse.json({ error: "Please provide a valid 10-digit mobile number." }, { status: 400 });
    if (ctx && ctx.whatsapp_number !== cleanMobile) {
      return NextResponse.json(
        { error: "Please use the same WhatsApp number this booking was made from." },
        { status: 403 }
      );
    }

    const dob = new Date(`${String(data.dateOfBirth || "")}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.dateOfBirth || "")) || Number.isNaN(dob.getTime())) {
      return NextResponse.json({ error: "Please provide the rider's date of birth." }, { status: 400 });
    }
    const age = ageOn(dob);
    if (age < 4 || age > 100) {
      return NextResponse.json({ error: "Please check the date of birth (riders must be at least 4 years old)." }, { status: 400 });
    }
    const isMinor = age < 18;
    const guardianName = str(data.guardianName, 100);
    if (isMinor && guardianName.length < 2) {
      return NextResponse.json({ error: "The rider is under 18: a parent or guardian name is mandatory." }, { status: 400 });
    }

    const cleanEmergencyPerson = str(data.emergencyContactPerson, 100);
    if (cleanEmergencyPerson.length < 2) {
      return NextResponse.json({ error: "Please provide an emergency contact person name." }, { status: 400 });
    }
    const cleanEmergencyPhone = normalizePhone(data.emergencyContactNumber);
    if (!cleanEmergencyPhone) {
      return NextResponse.json({ error: "Please provide a valid 10-digit emergency contact phone number." }, { status: 400 });
    }
    if (cleanMobile === cleanEmergencyPhone) {
      return NextResponse.json({ error: "Emergency contact number must be different from the rider's phone number." }, { status: 400 });
    }
    if (!data.medicalFitnessConfirmed || !data.safetyRulesAcknowledged || !data.indemnityAccepted) {
      return NextResponse.json({ error: "You must acknowledge and accept all safety and indemnity declarations." }, { status: 400 });
    }
    const cleanSignature = str(data.digitalSignatureName, 150);
    if (cleanSignature.length < 2) {
      return NextResponse.json({ error: "Please type your full legal name as digital signature." }, { status: 400 });
    }
    const email = str(data.email, 100);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address or leave it empty." }, { status: 400 });
    }
    const num = (v: unknown, lo: number, hi: number) => {
      const n = parseFloat(String(v ?? ""));
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
    };
    const activity = toActivityEnum(data.activity || ctx?.service_title);
    const level = toLevelEnum(data.level);

    // 1. Customer (an existing booking keeps its owner).
    const customerId: string = ctx
      ? ctx.customer_id
      : (
          await query(
            `INSERT INTO customers (whatsapp_number, full_name) VALUES ($1, $2)
             ON CONFLICT (whatsapp_number) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = CURRENT_TIMESTAMP
             RETURNING customer_id;`,
            [cleanMobile, cleanFullName]
          )
        ).rows[0].customer_id;

    // 2. Registration + consents.
    const regRes = await query(
      `INSERT INTO registrations (
        customer_id, activity, rider_level, full_name, address, mobile_number, email,
        occupation, date_of_birth, height_cm, weight_kg, blood_group,
        emergency_contact_person, emergency_contact_number, family_physician,
        is_minor, guardian_name, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'COMPLETED')
      RETURNING registration_id;`,
      [
        customerId,
        activity,
        level,
        cleanFullName,
        str(data.address, 500) || "N/A",
        cleanMobile,
        email || null,
        str(data.occupation, 100) || null,
        String(data.dateOfBirth),
        num(data.heightCm, 50, 250),
        num(data.weightKg, 15, 150),
        str(data.bloodGroup, 10) || null,
        cleanEmergencyPerson,
        cleanEmergencyPhone,
        str(data.familyPhysician, 100) || null,
        isMinor,
        isMinor ? guardianName : null,
      ]
    );
    const registrationId: string = regRes.rows[0].registration_id;

    await query(
      `INSERT INTO consents (
        registration_id, customer_id, medical_fitness_confirmed, safety_rules_acknowledged,
        indemnity_accepted, media_consent_granted, digital_signature_name, digital_signature_date
      ) VALUES ($1, $2, TRUE, TRUE, TRUE, $3, $4, CURRENT_DATE);`,
      [registrationId, customerId, Boolean(data.mediaConsentGranted), cleanSignature]
    );

    // 3. Booking: link the waiver, advance + extend the slot hold, move the chat to "payment pending".
    const checkoutUrl = (() => {
      const q = new URLSearchParams({ phone: cleanMobile.replace(/\D/g, ""), name: cleanFullName });
      if (ctx) q.set("order_id", ctx.order_id);
      return `/checkout?${q.toString()}`;
    })();

    if (!ctx) {
      // No booking yet (waiver signed from the website first): continue on the checkout page.
      return NextResponse.json({ success: true, customerId, registrationId, checkoutUrl });
    }

    await query(`UPDATE selected_services SET registration_id = $1 WHERE order_id = $2::uuid;`, [registrationId, ctx.order_id]);
    const holdAlive = await extendHold(ctx.order_id, HOLD_MINUTES_PAYMENT, "PENDING_PAYMENT");
    await query(
      `INSERT INTO conversations (customer_id, session_id, current_state, control_mode, current_intent, active_order_id)
       VALUES ($1, $2, 'PAYMENT_PENDING', 'AI_HANDLED', 'registration_completed', $3::uuid)
       ON CONFLICT (session_id) DO UPDATE
       SET current_state = CASE WHEN conversations.current_state = 'PAYMENT_SUCCESS' THEN conversations.current_state ELSE 'PAYMENT_PENDING' END,
           active_order_id = EXCLUDED.active_order_id, updated_at = CURRENT_TIMESTAMP;`,
      [customerId, `wa_${cleanMobile.replace(/\D/g, "")}`, ctx.order_id]
    );

    // 4. Payment link on WhatsApp: n8n is the single dispatcher; direct send only if n8n fails.
    if (!ctx.paid) {
      const n8n = await postToN8n(process.env.N8N_REGISTRATION_WEBHOOK_URL, {
        customerId,
        registrationId,
        orderId: ctx.order_id,
        fullName: cleanFullName,
        mobileNumber: cleanMobile,
        activity,
        level,
      });
      if (!n8n.ok) {
        console.error(`[register] n8n registration webhook failed: HTTP ${n8n.status}`, n8n.json);
        await sendCtaUrlMessage(
          cleanMobile,
          "✅ Waiver Verified",
          `Hello *${cleanFullName}*! 🐎\n\nYour rider waiver for *${ctx.service_title}* is recorded.\n\n• 💳 Amount: *₹${ctx.total_amount_inr.toLocaleString("en-IN")}*\n${ctx.booking && holdAlive ? `• 📆 Slot held: *${ctx.booking.display_date}, ${ctx.booking.start_time}* (30 min)\n` : ""}\nTap below to pay securely and confirm your booking.`,
          "💳 Pay & Confirm",
          `${APP_URL}${checkoutUrl}`,
          "Gorai Equestrian Centre 🐎"
        ).catch((err) => console.error("[register] direct WhatsApp send failed:", err));
      }
    }

    return NextResponse.json({ success: true, customerId, registrationId, orderId: ctx.order_id, checkoutUrl, slotHeld: holdAlive });
  } catch (err: any) {
    console.error("Registration error:", err);
    return NextResponse.json({ error: "Unable to complete registration. Please try again." }, { status: 500 });
  }
}

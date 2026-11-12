import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }
  const startTime = Date.now();
  try {
    // 1. KPIs
    const kpiRes = await query(`
      SELECT
        (SELECT COUNT(*) FROM customers) AS total_customers,
        (SELECT COUNT(*) FROM registrations WHERE status = 'COMPLETED') AS total_registrations,
        (SELECT COALESCE(SUM(amount_inr), 0) FROM payments WHERE payment_status = 'PAID') AS total_revenue,
        (SELECT COUNT(*) FROM conversations WHERE control_mode = 'HUMAN_HANDOVER') AS active_human_takeovers;
    `);

    // 2. Services
    const servicesRes = await query(`
      SELECT service_id, service_code, title, price_inr, duration_minutes, sessions_count, target_rider_level, description, brochure_page, is_active
      FROM services
      ORDER BY price_inr ASC;
    `);

    // 3. Conversations with latest messages
    const convRes = await query(`
      SELECT 
        c.conversation_id, c.customer_id, c.session_id, c.current_state, c.control_mode, c.language, c.last_user_message_at,
        cust.full_name, cust.whatsapp_number,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', m.message_id,
                'sender', m.sender,
                'text', m.content,
                'direction', m.direction,
                'time', to_char(m.created_at, 'HH24:MI')
              ) ORDER BY m.created_at ASC
            )
            FROM messages m
            WHERE m.conversation_id = c.conversation_id
          ), '[]'::json
        ) AS messages
      FROM conversations c
      JOIN customers cust ON cust.customer_id = c.customer_id
      ORDER BY c.updated_at DESC
      LIMIT 25;
    `);

    // 4. Registrations & Consents
    const regRes = await query(`
      SELECT 
        r.registration_id, r.customer_id, r.activity, r.rider_level, r.full_name, r.address,
        r.mobile_number, r.email, r.occupation, r.date_of_birth, r.height_cm, r.weight_kg,
        r.blood_group, r.emergency_contact_person, r.emergency_contact_number, r.family_physician,
        r.is_minor, r.guardian_name, r.status, r.created_at,
        c.medical_fitness_confirmed, c.safety_rules_acknowledged, c.indemnity_accepted,
        c.media_consent_granted, c.digital_signature_name, c.accepted_at
      FROM registrations r
      LEFT JOIN consents c ON c.registration_id = r.registration_id
      ORDER BY r.created_at DESC
      LIMIT 50;
    `);

    // 5. Payments
    const payRes = await query(`
      SELECT 
        p.payment_id, p.order_id, p.amount_inr, p.currency, p.payment_status,
        p.payment_gateway, p.gateway_payment_id, p.receipt_number, p.paid_at, p.created_at,
        s.service_title, cust.full_name, cust.whatsapp_number
      FROM payments p
      JOIN selected_services s ON s.order_id = p.order_id
      JOIN customers cust ON cust.customer_id = p.customer_id
      ORDER BY p.created_at DESC
      LIMIT 50;
    `);

    // 6. Knowledge Base
    const kbRes = await query(`
      SELECT kb_id, category, title, content, is_active, created_at
      FROM knowledge_base
      ORDER BY created_at DESC;
    `);

    // 7. Visual Assets
    const assetRes = await query(`
      SELECT asset_id, topic_key, title, brochure_source_page, image_url, caption_en, caption_hi
      FROM visual_assets
      ORDER BY brochure_source_page ASC;
    `);

    const dbLatencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        kpis: kpiRes.rows[0],
        services: servicesRes.rows,
        conversations: convRes.rows,
        registrations: regRes.rows,
        payments: payRes.rows,
        knowledgeBase: kbRes.rows,
        visualAssets: assetRes.rows,
        latencyMs: dbLatencyMs,
        dbStatus: "CONNECTED"
      }
    });
  } catch (error: any) {
    console.error("Database fetch error:", error);
    return NextResponse.json(
      { success: false, error: error.message, dbStatus: "ERROR" },
      { status: 500 }
    );
  }
}

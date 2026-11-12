import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { sendTextMessage } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }
  try {
    const { conversationId, text, adminUser } = await req.json();

    if (!conversationId || !text) {
      return NextResponse.json({ error: "Missing conversationId or text" }, { status: 400 });
    }

    // Get customer_id and phone
    const convRes = await query(
      `SELECT c.customer_id, cust.whatsapp_number 
       FROM conversations c
       JOIN customers cust ON cust.customer_id = c.customer_id
       WHERE c.conversation_id = $1;`,
      [conversationId]
    );

    if (convRes.rowCount === 0) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const { customer_id: customerId, whatsapp_number: rawPhone } = convRes.rows[0];

    // Ensure conversation is in HUMAN_HANDOVER mode
    await query(
      `UPDATE conversations 
       SET control_mode = 'HUMAN_HANDOVER'::control_mode,
           current_state = 'HUMAN_HANDOVER'::conversation_state,
           updated_at = CURRENT_TIMESTAMP 
       WHERE conversation_id = $1;`,
      [conversationId]
    );

    // Insert staff outbound message
    const msgRes = await query(
      `INSERT INTO messages (conversation_id, customer_id, direction, message_type, content, sender)
       VALUES ($1, $2, 'OUTBOUND', 'text', $3, 'admin_staff')
       RETURNING message_id, content, sender, to_char(created_at, 'HH24:MI') as time;`,
      [conversationId, customerId, text]
    );

    // Dispatch directly to WhatsApp Cloud API via sendTextMessage
    const cleanPhone = (rawPhone || "").replace(/\D/g, "");
    if (cleanPhone) {
      await sendTextMessage(cleanPhone, text);
    }

    return NextResponse.json({ success: true, message: msgRes.rows[0] });
  } catch (err: any) {
    console.error("Admin reply error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

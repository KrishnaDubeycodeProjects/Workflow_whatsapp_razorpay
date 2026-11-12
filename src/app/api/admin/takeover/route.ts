import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }
  try {
    const { conversationId, mode, adminUser } = await req.json();

    if (!conversationId || !mode) {
      return NextResponse.json({ error: "Missing conversationId or mode" }, { status: 400 });
    }

    // 1. Update conversation state
    const updateRes = await query(
      `UPDATE conversations
       SET control_mode = $1,
           current_state = CASE WHEN $1 = 'HUMAN_HANDOVER' THEN 'HUMAN_HANDOVER'::conversation_state ELSE 'BROWSING'::conversation_state END,
           updated_at = CURRENT_TIMESTAMP
       WHERE conversation_id = $2
       RETURNING conversation_id, customer_id, control_mode, current_state;`,
      [mode, conversationId]
    );

    if (updateRes.rowCount === 0) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const conv = updateRes.rows[0];

    // 2. Log system message in messages table
    const noticeText =
      mode === "HUMAN_HANDOVER"
        ? "🚨 Staff Admin took over this chat. Automated AI replies are paused."
        : "🤖 AI mode restored. Automated replies are active.";

    await query(
      `INSERT INTO messages (conversation_id, customer_id, direction, message_type, content, sender)
       VALUES ($1, $2, 'OUTBOUND', 'text', $3, 'system');`,
      [conversationId, conv.customer_id, noticeText]
    );

    // 3. Record audit log
    await query(
      `INSERT INTO admin_audit (admin_user, action, target_entity, entity_id, changes)
       VALUES ($1, 'HUMAN_TAKEOVER_TOGGLE', 'conversation', $2, json_build_object('mode', $3));`,
      [adminUser || "admin_staff", conversationId, mode]
    );

    return NextResponse.json({ success: true, conversation: conv });
  } catch (err: any) {
    console.error("Takeover error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

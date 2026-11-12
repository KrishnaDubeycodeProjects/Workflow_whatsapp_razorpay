import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }
  try {
    const { category, title, content, adminUser } = await req.json();

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content required" }, { status: 400 });
    }

    const res = await query(
      `INSERT INTO knowledge_base (category, title, content, is_active, created_by)
       VALUES ($1, $2, $3, true, $4)
       RETURNING kb_id, category, title, content, is_active, created_at;`,
      [category || "Announcements", title, content, adminUser || "admin"]
    );

    return NextResponse.json({ success: true, item: res.rows[0] });
  } catch (err: any) {
    console.error("Add knowledge error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

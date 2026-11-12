import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public, read-only service catalogue for the customer site (home + checkout).
// Replaces the public pages' former use of /api/admin/data, which exposed
// customer conversations, registrations and payments to anyone.
export async function GET() {
  try {
    const res = await query(`
      SELECT service_id, service_code, title, price_inr, duration_minutes, sessions_count,
             target_rider_level, description, brochure_page, is_active
      FROM services
      WHERE is_active = true
      ORDER BY price_inr ASC;
    `);
    return NextResponse.json(
      { success: true, data: { services: res.rows } },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (error: any) {
    console.error("Public services fetch error:", error);
    return NextResponse.json({ success: false, error: "Unable to load services" }, { status: 500 });
  }
}

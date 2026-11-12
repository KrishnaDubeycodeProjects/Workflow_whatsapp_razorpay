import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing property identifier" },
        { status: 400 }
      );
    }

    // Check if UUID or slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const sql = isUUID
      ? "SELECT * FROM real_estate_properties WHERE property_id = $1 LIMIT 1"
      : "SELECT * FROM real_estate_properties WHERE slug = $1 LIMIT 1";

    const res = await query(sql, [id]);

    if (res.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Property not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      property: res.rows[0],
    });
  } catch (err: any) {
    console.error("[API Property Single GET Error]", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

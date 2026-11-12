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
      return new NextResponse("Missing image ID", { status: 400 });
    }

    // Query Neon PostgreSQL directly for the raw image BYTEA
    const res = await query(
      "SELECT mime_type, image_data, file_name FROM property_images WHERE image_id = $1 LIMIT 1",
      [id]
    );

    if (res.rows.length === 0) {
      return new NextResponse("Image not found in database", { status: 404 });
    }

    const { mime_type, image_data, file_name } = res.rows[0];

    // image_data is returned as a Buffer from the pg library for BYTEA columns
    const buffer = Buffer.isBuffer(image_data)
      ? image_data
      : Buffer.from(image_data);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mime_type || "image/jpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${file_name || "property-photo.jpg"}"`,
      },
    });
  } catch (err: any) {
    console.error("[Property Image Stream Error]", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

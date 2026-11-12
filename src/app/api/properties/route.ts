import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status") || "published";

    const res = await query(
      `SELECT * FROM real_estate_properties 
       WHERE status = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [status, limit]
    );

    return NextResponse.json({
      success: true,
      count: res.rows.length,
      properties: res.rows,
    });
  } catch (err: any) {
    console.error("[API Properties GET Error]", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const title = body.title || "Exclusive Luxury Property";
    const property_type = body.property_type || "Villa";
    const listing_type = body.listing_type || "Sale";
    const price = body.price || "₹2.50 Cr";
    const location = body.location || "Gorai, Mumbai";
    const city = body.city || "Mumbai";
    const bedrooms = parseInt(body.bedrooms || "3");
    const bathrooms = parseInt(body.bathrooms || "3");
    const area_sqft = parseInt(body.area_sqft || "1800");
    const furnishing = body.furnishing || "Semi-Furnished";
    const description = body.description || `${bedrooms} BHK ${property_type} in ${location}. Exceptional layout and premium fittings.`;
    const amenities = Array.isArray(body.amenities) ? body.amenities : ["Garden", "Sea View", "Covered Parking", "24/7 Security"];
    const rawImages = Array.isArray(body.images) && body.images.length > 0
      ? body.images
      : [
          "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1200&q=80",
          "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80"
        ];

    // Download and store raw photos directly into Neon DB property_images table
    const storedDbImageEndpoints: string[] = [];
    const newlyCreatedImageIds: string[] = [];

    for (let i = 0; i < rawImages.length; i++) {
      const imgUrl = rawImages[i];
      if (imgUrl.startsWith("/api/properties/images/")) {
        storedDbImageEndpoints.push(imgUrl);
      } else if (/^https?:\/\//i.test(imgUrl)) {
        try {
          const resp = await fetch(imgUrl);
          if (resp.ok) {
            const arrayBuf = await resp.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);
            const mimeType = resp.headers.get("content-type") || "image/jpeg";
            const imgInsert = await query(
              `INSERT INTO property_images (mime_type, file_name, file_size_bytes, image_data)
               VALUES ($1, $2, $3, $4) RETURNING image_id`,
              [mimeType, `photo_${i + 1}.jpg`, buffer.length, buffer]
            );
            const imgId = imgInsert.rows[0].image_id;
            newlyCreatedImageIds.push(imgId);
            storedDbImageEndpoints.push(`/api/properties/images/${imgId}`);
          } else {
            storedDbImageEndpoints.push(imgUrl);
          }
        } catch {
          storedDbImageEndpoints.push(imgUrl);
        }
      } else {
        storedDbImageEndpoints.push(imgUrl);
      }
    }

    const images = storedDbImageEndpoints;
    const contact_phone = body.contact_phone || "+91 93220 13233";
    const contact_name = body.contact_name || "Estate Concierge";
    const submitted_by_phone = body.submitted_by_phone || null;

    // Generate slug
    const cleanSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const slug = `${cleanSlug}-${randomSuffix}`;

    const insertRes = await query(
      `INSERT INTO real_estate_properties (
        slug, title, property_type, listing_type, price, location, city,
        bedrooms, bathrooms, area_sqft, furnishing, description,
        amenities, images, contact_phone, contact_name, status, submitted_by_phone
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16, 'published', $17
      ) RETURNING *`,
      [
        slug,
        title,
        property_type,
        listing_type,
        price,
        location,
        city,
        bedrooms,
        bathrooms,
        area_sqft,
        furnishing,
        description,
        JSON.stringify(amenities),
        JSON.stringify(images),
        contact_phone,
        contact_name,
        submitted_by_phone,
      ]
    );

    const saved = insertRes.rows[0];

    // Associate image rows with property_id in Neon DB
    if (newlyCreatedImageIds.length > 0) {
      await query(
        "UPDATE property_images SET property_id = $1 WHERE image_id = ANY($2::uuid[])",
        [saved.property_id, newlyCreatedImageIds]
      );
    }

    return NextResponse.json({
      success: true,
      message: "Property created successfully",
      property: saved,
      url: `/properties/${saved.property_id}`,
      slug_url: `/properties/${saved.slug}`,
    });
  } catch (err: any) {
    console.error("[API Properties POST Error]", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

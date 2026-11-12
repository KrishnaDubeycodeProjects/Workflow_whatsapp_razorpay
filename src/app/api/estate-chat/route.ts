import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { sendTextMessage, sendButtonMessage, downloadWhatsAppMedia } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://goraiequestriancentre.vercel.app";

// Deduplication cache for incoming WhatsApp message IDs (prevents double triggers on webhook retries)
const processedMessageIds = new Map<string, number>();

function isDuplicateMessage(messageId?: string | null): boolean {
  if (!messageId) return false;
  const now = Date.now();

  // Prune entries older than 2 minutes
  for (const [id, timestamp] of processedMessageIds.entries()) {
    if (now - timestamp > 120000) {
      processedMessageIds.delete(id);
    }
  }

  if (processedMessageIds.has(messageId)) {
    return true;
  }

  processedMessageIds.set(messageId, now);
  return false;
}

interface DraftData {
  title?: string;
  price?: string;
  location?: string;
  city?: string;
  property_type?: string;
  listing_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  area_sqft?: number;
  furnishing?: string;
  description?: string;
  amenities?: string[];
  images?: string[];
}

function extractDetails(text: string, currentDraft: DraftData): DraftData {
  const updated: DraftData = { ...currentDraft };
  const lower = text.toLowerCase();

  // 1. Detect Images (Multiple URLs in text: Unsplash, Cloudinary, Imgur, direct links)
  const urlMatches = text.match(/https?:\/\/[^\s"'<>]+/gi);
  if (urlMatches && urlMatches.length > 0) {
    const validImgUrls = urlMatches.filter((u) =>
      /\.(jpg|jpeg|png|webp|gif|avif)/i.test(u) ||
      u.includes("images.unsplash.com") ||
      u.includes("unsplash.com") ||
      u.includes("catbox.moe") ||
      u.includes("fbcdn.net") ||
      u.includes("cloudinary.com") ||
      u.includes("postimg.cc") ||
      u.includes("imgur.com")
    );
    if (validImgUrls.length > 0) {
      updated.images = Array.from(new Set([...(updated.images || []), ...validImgUrls]));
    }
  }

  // 2. Detect BHK / Bedrooms
  const bhkMatch = lower.match(/(\d+)\s*(?:bhk|bed|bedroom)/i);
  if (bhkMatch) {
    updated.bedrooms = parseInt(bhkMatch[1], 10);
  }

  // 3. Detect Bathrooms
  const bathMatch = lower.match(/(\d+)\s*(?:bath|bathroom|washroom)/i);
  if (bathMatch) {
    updated.bathrooms = parseInt(bathMatch[1], 10);
  }

  // 4. Detect Area / Sq Ft
  const areaMatch = lower.match(/(\d{3,5})\s*(?:sq\s*ft|sqft|square\s*feet|sq\.\s*ft)/i);
  if (areaMatch) {
    updated.area_sqft = parseInt(areaMatch[1], 10);
  }

  // 5. Detect Property Type
  if (/\bvilla\b/i.test(lower)) updated.property_type = "Villa";
  else if (/\bapartment|flat\b/i.test(lower)) updated.property_type = "Apartment";
  else if (/\bpenthouse\b/i.test(lower)) updated.property_type = "Penthouse";
  else if (/\bfarmhouse|farm\b/i.test(lower)) updated.property_type = "Farmhouse";
  else if (/\bplot|land\b/i.test(lower)) updated.property_type = "Plot";

  // 6. Detect Listing Type
  if (/\brent|lease|rental|per month|\/mo\b/i.test(lower)) updated.listing_type = "Rent";
  else if (/\bsale|buy|resale|crore|cr|lakh|lac\b/i.test(lower)) updated.listing_type = "Sale";

  // 7. Detect Price
  const priceMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(cr|crore|crores|lakh|lakhs|lac|lacs|k|per month|\/month|\/mo)/i);
  if (priceMatch) {
    updated.price = priceMatch[0].trim();
  } else if (!updated.price) {
    const rawNumberMatch = text.match(/(?:price|rate|cost|for)\s*(?:is|:)?\s*(?:₹|rs\.?)?\s*([0-9,]+)/i);
    if (rawNumberMatch) {
      updated.price = `₹${rawNumberMatch[1]}`;
    }
  }

  // 8. Detect Location
  const locMatch = text.match(/(?:in|at|near|location:?)\s+([A-Z][a-zA-Z0-9\s,–-]+?)(?:\.|\n|with|featuring|price|$)/);
  if (locMatch && locMatch[1].length > 2 && !/^(the|a|an|my|our)\s*$/i.test(locMatch[1].trim())) {
    updated.location = locMatch[1].trim();
  }

  // 9. Amenities extraction
  const potentialAmenities = [
    "Swimming Pool", "Private Garden", "Ocean View", "Sea Facing", "Covered Parking",
    "24/7 Security", "Gym", "Power Backup", "Balcony", "Clubhouse", "Terrace", "Lift", "Private Stable"
  ];
  const detectedAmenities: string[] = updated.amenities || [];
  for (const amenity of potentialAmenities) {
    if (new RegExp(`\\b${amenity}\\b`, "i").test(text) && !detectedAmenities.includes(amenity)) {
      detectedAmenities.push(amenity);
    }
  }
  if (detectedAmenities.length > 0) {
    updated.amenities = detectedAmenities;
  }

  // 10. Title construction if not present
  if (!updated.title) {
    const titleMatch = text.match(/(?:title:?|name:?)\s*([^\n\.,]+)/i);
    if (titleMatch) {
      updated.title = titleMatch[1].trim();
    } else if (updated.location || updated.property_type || updated.bedrooms) {
      const bhkStr = updated.bedrooms ? `${updated.bedrooms}BHK ` : "";
      const typeStr = updated.property_type || "Luxury Property";
      const locStr = updated.location ? ` in ${updated.location}` : "";
      updated.title = `${bhkStr}${typeStr}${locStr}`.trim();
    }
  }

  // 11. Description accumulation
  if (!updated.description || updated.description.length < text.length) {
    if (text.length > 30 && !/^(publish|done|yes|save|ok|cancel|exit)$/i.test(text.trim())) {
      updated.description = text.trim();
    }
  }

  return updated;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawNumber = body.whatsappNumber || body.from || "";
    const cleanNumber = rawNumber.replace(/\D/g, "");
    const userText = (body.messageText || body.text || "").trim();
    const btnId = body.interactiveId || "";
    const mediaUrl = body.mediaUrl || null;
    const mediaId = body.mediaId || body.media_id || null;
    const mediaMimeType = body.mediaMimeType || body.mime_type || "image/jpeg";
    const messageId = body.messageId || body.id || null;

    // Detect if called from n8n (via header or payload field)
    const isN8n = req.headers.get("x-caller") === "n8n" || body.caller === "n8n";

    // Deduplication check: if the exact same messageId arrived within the last 2 minutes, ignore retry
    if (isDuplicateMessage(messageId)) {
      console.log(`[Deduplication] Ignoring duplicate messageId: ${messageId}`);
      return NextResponse.json({ success: true, duplicate: true });
    }

    if (!cleanNumber) {
      return NextResponse.json({ success: false, error: "Missing whatsappNumber" }, { status: 400 });
    }

    const formattedPhone = `+${cleanNumber}`;
    const lower = userText.toLowerCase();

    // ─── 1. USER EXITS REAL ESTATE MODE ───
    if (
      btnId === "re_cancel" ||
      btnId === "btn_menu" ||
      /^(exit|quit|cancel|stop|back|menu|restart)$/i.test(lower)
    ) {
      await query(
        "DELETE FROM real_estate_drafts WHERE whatsapp_number = $1",
        [formattedPhone]
      );
      await query(
        "UPDATE conversations SET current_intent = 'general_enquiry' WHERE session_id = $1",
        [`wa_${cleanNumber}`]
      );

      const exitMsg =
        "👋 *Exited Real Estate Mode.*\n\nYou are back at Gorai Equestrian Centre Concierge 🐎.\n\nType *'menu'* or *'plans'* anytime to view horse riding experiences!";

      const exitPayload = {
        messaging_product: "whatsapp",
        to: cleanNumber,
        type: "text",
        text: { body: exitMsg },
      };

      // Only dispatch directly if NOT called by n8n (n8n sends waPayload downstream)
      if (!isN8n) {
        await sendTextMessage(formattedPhone, exitMsg);
      }

      return NextResponse.json({
        success: true,
        action: "EXITED",
        replyText: exitMsg,
        waPayload: exitPayload,
      });
    }

    // ─── 2. FETCH OR CREATE DRAFT ───
    const draftRes = await query(
      "SELECT * FROM real_estate_drafts WHERE whatsapp_number = $1 LIMIT 1",
      [formattedPhone]
    );

    let isNewSession = false;
    let currentDraft: DraftData = {};
    let step = "COLLECTING_INFO";

    if (
      draftRes.rows.length === 0 ||
      btnId === "re_new" ||
      /^(#realestate|#property|#listing|\/realestate|start realestate)$/i.test(lower)
    ) {
      isNewSession = true;
      currentDraft = {
        property_type: "Villa",
        listing_type: "Sale",
        bedrooms: 3,
        bathrooms: 3,
        amenities: ["Private Garden", "Covered Parking", "24/7 Security"],
        images: mediaUrl ? [mediaUrl] : [],
      };

      await query(
        `INSERT INTO real_estate_drafts (whatsapp_number, step, draft_data)
         VALUES ($1, 'COLLECTING_INFO', $2)
         ON CONFLICT (whatsapp_number) DO UPDATE
         SET step = 'COLLECTING_INFO', draft_data = $2, updated_at = CURRENT_TIMESTAMP`,
        [formattedPhone, JSON.stringify(currentDraft)]
      );

      // Also mark current_intent in conversations
      await query(
        "UPDATE conversations SET current_intent = 'real_estate_mode' WHERE session_id = $1",
        [`wa_${cleanNumber}`]
      );

      // If user provided details right inside the initial trigger message
      if (userText.length > 15 && !userText.startsWith("#")) {
        currentDraft = extractDetails(userText, currentDraft);
        await query(
          "UPDATE real_estate_drafts SET draft_data = $1 WHERE whatsapp_number = $2",
          [JSON.stringify(currentDraft), formattedPhone]
        );
      } else {
        const welcomeMsg =
          "🏡 *Real Estate Listing Mode Activated!*\n\n" +
          "I will build your custom luxury property showcase webpage with high-res photos and direct WhatsApp booking.\n\n" +
          "Please share your property details:\n" +
          "• *Title / Type* (e.g. 4BHK Beachfront Villa)\n" +
          "• *Location* (e.g. Gorai Beach Road, Mumbai)\n" +
          "• *Price* (e.g. ₹2.75 Cr or ₹80,000 / month)\n" +
          "• *Specs* (Bedrooms, Bathrooms, Sq Ft)\n" +
          "• *Photos* (Send one or multiple photos directly in chat! 📸)\n\n" +
          "_You can send everything in one message or step-by-step._\n" +
          "Type *'exit'* anytime to leave.";

        const welcomePayload = {
          messaging_product: "whatsapp",
          to: cleanNumber,
          type: "text",
          text: { body: welcomeMsg },
        };

        // Only dispatch directly if NOT called by n8n
        if (!isN8n) {
          await sendTextMessage(formattedPhone, welcomeMsg);
        }

        return NextResponse.json({
          success: true,
          action: "MODE_ACTIVATED",
          replyText: welcomeMsg,
          waPayload: welcomePayload,
        });
      }
    } else {
      currentDraft = (draftRes.rows[0].draft_data as DraftData) || {};
      step = draftRes.rows[0].step || "COLLECTING_INFO";
    }

    // ─── 3. PROCESS INCOMING DETAILS OR MULTIPLE IMAGES ───
    let photoJustUploaded = false;

    // Handle direct WhatsApp Media Attachment (Download binary buffer & save to Neon DB BYTEA)
    if (mediaId) {
      console.log(`[WA Media] Downloading mediaId: ${mediaId} from WhatsApp Cloud API...`);
      const mediaResult = await downloadWhatsAppMedia(mediaId);
      if (mediaResult && mediaResult.buffer) {
        const imgInsert = await query(
          `INSERT INTO property_images (mime_type, file_name, file_size_bytes, image_data)
           VALUES ($1, $2, $3, $4) RETURNING image_id`,
          [mediaResult.mimeType || mediaMimeType, `wa_${mediaId}.jpg`, mediaResult.fileSize, mediaResult.buffer]
        );
        const imgId = imgInsert.rows[0].image_id;
        const endpointUrl = `/api/properties/images/${imgId}`;

        // Fresh draft fetch to avoid race condition when multiple photos arrive in burst
        const freshDraftRes = await query(
          "SELECT draft_data FROM real_estate_drafts WHERE whatsapp_number = $1",
          [formattedPhone]
        );
        const existingImages: string[] = freshDraftRes.rows[0]?.draft_data?.images || currentDraft.images || [];
        currentDraft.images = Array.from(new Set([...existingImages, endpointUrl]));
        photoJustUploaded = true;
        console.log(`✅ [WA Media Stored in Neon DB] Saved image_id: ${imgId} (${mediaResult.fileSize} bytes). Total images: ${currentDraft.images.length}`);
      }
    }

    if (mediaUrl) {
      currentDraft.images = Array.from(new Set([...(currentDraft.images || []), mediaUrl]));
    }

    // Extract any property details (or links) present in user text
    currentDraft = extractDetails(userText, currentDraft);

    // Update draft in database
    await query(
      "UPDATE real_estate_drafts SET draft_data = $1, updated_at = CURRENT_TIMESTAMP WHERE whatsapp_number = $2",
      [JSON.stringify(currentDraft), formattedPhone]
    );

    // ─── 4. CHECK FOR PUBLISH REQUEST ───
    const isPublishCommand =
      btnId === "re_publish" ||
      /^(publish|publish listing|confirm|save|done|create|make live|yes)$/i.test(lower);

    if (isPublishCommand) {
      const title = currentDraft.title || `${currentDraft.bedrooms || 3}BHK ${currentDraft.property_type || "Villa"}`;
      const price = currentDraft.price || "Price on Request";
      const location = currentDraft.location || "Gorai, Mumbai";
      const bedrooms = currentDraft.bedrooms || 3;
      const bathrooms = currentDraft.bathrooms || 3;
      const area_sqft = currentDraft.area_sqft || 1850;
      const property_type = currentDraft.property_type || "Villa";
      const listing_type = currentDraft.listing_type || "Sale";
      const furnishing = currentDraft.furnishing || "Semi-Furnished";
      const description = currentDraft.description || `${bedrooms} BHK ${property_type} in ${location} with luxury amenities and direct beach access.`;
      const amenities = currentDraft.amenities && currentDraft.amenities.length > 0
        ? currentDraft.amenities
        : ["Private Garden", "Sea View", "Covered Parking", "24/7 Security", "Private Stable"];

      // Download and store any external photo links directly into Neon PostgreSQL BYTEA column
      const rawImages = currentDraft.images && currentDraft.images.length > 0
        ? currentDraft.images
        : [
            "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1600&q=80",
            "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80"
          ];

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

      // Generate clean unique slug
      const cleanSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const slug = `${cleanSlug}-${randomSuffix}`;

      // Insert into real_estate_properties
      const insertRes = await query(
        `INSERT INTO real_estate_properties (
          slug, title, property_type, listing_type, price, location, city,
          bedrooms, bathrooms, area_sqft, furnishing, description,
          amenities, images, contact_phone, contact_name, status, submitted_by_phone
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'Mumbai',
          $7, $8, $9, $10, $11,
          $12, $13, $14, 'Gorai Concierge Desk', 'published', $15
        ) RETURNING property_id, slug, title`,
        [
          slug,
          title,
          property_type,
          listing_type,
          price,
          location,
          bedrooms,
          bathrooms,
          area_sqft,
          furnishing,
          description,
          JSON.stringify(amenities),
          JSON.stringify(images),
          formattedPhone,
          formattedPhone,
        ]
      );

      const saved = insertRes.rows[0];

      // Associate property_id with the property_images in Neon DB
      if (newlyCreatedImageIds.length > 0) {
        await query(
          "UPDATE property_images SET property_id = $1 WHERE image_id = ANY($2::uuid[])",
          [saved.property_id, newlyCreatedImageIds]
        );
      }

      const liveUrl = `${BASE_URL}/properties/${saved.slug || saved.property_id}`;

      // Clear draft
      await query("DELETE FROM real_estate_drafts WHERE whatsapp_number = $1", [formattedPhone]);

      const successLines = [
        "🎉 *Your Real Estate Webpage is LIVE!*",
        "",
        `🏡 *${title}*`,
        `📍 Location: ${location}`,
        `💰 Price: ${price}`,
        `🛏️ Details: ${bedrooms} BHK • ${area_sqft} sq ft • For ${listing_type}`,
        `📸 Photos: ${images.length} photo(s) available in interactive gallery`,
        "",
        "🔗 *View & Share Your Property Showcase:*",
        liveUrl,
        "",
        "Visitors can browse your photos, switch pictures in full-screen, view specifications, calculate EMIs, and message you directly on WhatsApp! 🚀"
      ];

      const waPublishedPayload = {
        messaging_product: "whatsapp",
        to: cleanNumber,
        type: "interactive",
        interactive: {
          type: "button",
          header: { type: "text", text: "Property Published 🏡" },
          body: { text: successLines.join("\n") },
          footer: { text: "Gorai Real Estate Concierge" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "re_new", title: "➕ List Another" } },
              { type: "reply", reply: { id: "btn_menu", title: "🐎 GEC Main Menu" } }
            ]
          }
        }
      };

      // Only dispatch directly if NOT called by n8n
      if (!isN8n) {
        await sendButtonMessage(
          formattedPhone,
          successLines.join("\n"),
          [
            { id: "re_new", title: "➕ List Another" },
            { id: "btn_menu", title: "🐎 GEC Main Menu" }
          ],
          "Property Published 🏡",
          "Gorai Real Estate Concierge"
        );
      }

      return NextResponse.json({
        success: true,
        action: "PUBLISHED",
        property_id: saved.property_id,
        url: liveUrl,
        replyText: successLines.join("\n"),
        waPayload: waPublishedPayload,
      });
    }

    // ─── 5. INTERACTIVE CONVERSATIONAL GUIDANCE ───
    const missing: string[] = [];
    if (!currentDraft.price) missing.push("💰 Price / Rent (e.g. ₹2.5 Cr or ₹75,000/mo)");
    if (!currentDraft.location) missing.push("📍 Location / Neighborhood (e.g. Gorai Beach Road)");
    if (!currentDraft.images || currentDraft.images.length === 0) missing.push("📸 Photos (Send photos directly in chat)");

    const summaryParts: string[] = [];
    if (currentDraft.title) summaryParts.push(`• *Title:* ${currentDraft.title}`);
    if (currentDraft.price) summaryParts.push(`• *Price:* ${currentDraft.price}`);
    if (currentDraft.location) summaryParts.push(`• *Location:* ${currentDraft.location}`);
    if (currentDraft.bedrooms) summaryParts.push(`• *Specs:* ${currentDraft.bedrooms} BHK (${currentDraft.area_sqft || 1800} sq ft)`);
    if (currentDraft.images && currentDraft.images.length > 0) {
      summaryParts.push(`• *Photos Stored:* ${currentDraft.images.length} photo(s) in database`);
    }

    const totalImagesCount = currentDraft.images?.length || 0;
    const photoNotice = photoJustUploaded
      ? `📸 *Photo #${totalImagesCount} received and saved directly to database!* (${totalImagesCount} photo${totalImagesCount > 1 ? "s" : ""} in draft)\n_You can send more photos anytime, or send other details._\n\n`
      : "";

    let responseMsg = "";

    if (missing.length === 0) {
      // Ready to publish!
      responseMsg =
        photoNotice +
        "✨ *All details captured successfully!*\n\n" +
        "📋 *Summary of your listing:*\n" +
        summaryParts.join("\n") +
        "\n\n" +
        "Would you like to publish this property now?\n" +
        "👉 Reply *'Publish'* to generate your live website link!";

      const waReadyPayload = {
        messaging_product: "whatsapp",
        to: cleanNumber,
        type: "interactive",
        interactive: {
          type: "button",
          header: { type: "text", text: "Draft Ready 🏡" },
          body: { text: responseMsg },
          footer: { text: "Gorai Real Estate Concierge" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "re_publish", title: "🚀 Publish Live" } },
              { type: "reply", reply: { id: "re_cancel", title: "❌ Cancel / Exit" } }
            ]
          }
        }
      };

      // Only dispatch directly if NOT called by n8n
      if (!isN8n) {
        await sendButtonMessage(
          formattedPhone,
          responseMsg,
          [
            { id: "re_publish", title: "🚀 Publish Live" },
            { id: "re_cancel", title: "❌ Cancel / Exit" }
          ],
          "Draft Ready 🏡",
          "Gorai Real Estate Concierge"
        );
      }

      return NextResponse.json({
        success: true,
        action: "UPDATED_DRAFT",
        draft: currentDraft,
        missing,
        replyText: responseMsg,
        waPayload: waReadyPayload,
      });
    } else {
      // Ask for missing details
      responseMsg =
        photoNotice +
        "Got it! 📝 I've recorded those details.\n\n" +
        (summaryParts.length > 0 ? "📋 *Current Draft:*\n" + summaryParts.join("\n") + "\n\n" : "") +
        "To finish your listing webpage, please provide:\n" +
        missing.join("\n") +
        "\n\n" +
        "_Tip: You can send multiple photos one after another!_\n" +
        "_Or reply *'Publish'* anytime to launch with what you have!_";

      const waMissingPayload = {
        messaging_product: "whatsapp",
        to: cleanNumber,
        type: "text",
        text: { body: responseMsg },
      };

      // Only dispatch directly if NOT called by n8n
      if (!isN8n) {
        await sendTextMessage(formattedPhone, responseMsg);
      }

      return NextResponse.json({
        success: true,
        action: "UPDATED_DRAFT",
        draft: currentDraft,
        missing,
        replyText: responseMsg,
        waPayload: waMissingPayload,
      });
    }
  } catch (err: any) {
    console.error("[Estate Chat Error]", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

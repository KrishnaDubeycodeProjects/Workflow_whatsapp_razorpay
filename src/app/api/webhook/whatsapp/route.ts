import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { detectIntent, generateAIResponse, fetchServices } from "@/lib/ai-engine";
import {
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Verify token comes ONLY from the WEBHOOK_VERIFY_TOKEN env var (never hard-code it).
const VALID_TOKENS: string[] = [process.env.WEBHOOK_VERIFY_TOKEN].filter((t): t is string => Boolean(t));
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://goraiequestriancentre.vercel.app";

// ═══════════════════════════════════════════════════════════════════
// 1. GET: Meta Webhook Verification Challenge
// ═══════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  console.log(`[Webhook GET] Mode: ${mode}, Token: ${token}`);

  if (mode === 'subscribe' && (VALID_TOKENS.includes(token || '') )) {
    console.log("[Webhook GET] Verification SUCCESS");
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return new Response("Forbidden", { status: 403 });
}

// ═══════════════════════════════════════════════════════════════════
// 2. POST: Single-ingress dispatcher
//
// n8n on EC2 (<n8n-host>/webhook/whatsapp-meta-ingress) is the
// SINGLE source of truth for conversational WhatsApp replies. This route must
// never reply alongside it, so its behaviour is controlled by WHATSAPP_WEBHOOK_MODE:
//
//   "disabled"   (default) Acknowledge with 200 and do nothing. No DB writes, no replies.
//   "forward"    Relay the raw Meta payload to n8n, then acknowledge. Use this only if
//                Meta's callback URL points at Vercel instead of n8n.
//   "standalone" Legacy Vercel bot (Bedrock AI + buttons). Emergency failover ONLY,
//                when n8n is down AND Meta points here. Never run alongside n8n.
//
// Admin outbound chat is unaffected: it goes through /api/admin/reply.
// ═══════════════════════════════════════════════════════════════════
const N8N_WHATSAPP_INGRESS_URL =
  process.env.N8N_WHATSAPP_INGRESS_URL || "";

export async function POST(req: NextRequest) {
  const mode = (process.env.WHATSAPP_WEBHOOK_MODE || "disabled").toLowerCase();

  if (mode === "standalone") {
    return standaloneBotHandler(req);
  }

  if (mode === "forward") {
    const raw = await req.text();
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const sig = req.headers.get("x-hub-signature-256");
      if (sig) headers["X-Hub-Signature-256"] = sig;
      const res = await fetch(N8N_WHATSAPP_INGRESS_URL, {
        method: "POST",
        headers,
        body: raw,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) console.error(`[Webhook forward] n8n responded HTTP ${res.status}`);
    } catch (err: any) {
      console.error("[Webhook forward] n8n unreachable:", err?.message || err);
    }
    // Always 200 so Meta does not retry (retries would cause duplicates downstream).
    return NextResponse.json({ status: "EVENT_RECEIVED", routedTo: "n8n" }, { status: 200 });
  }

  // Default: disabled — n8n owns inbound WhatsApp.
  return NextResponse.json({ status: "EVENT_RECEIVED", handledBy: "n8n" }, { status: 200 });
}

// ═══════════════════════════════════════════════════════════════════
// 2b. Legacy standalone bot: Incoming WhatsApp Messages → AI Hybrid Processing
//     (only reachable with WHATSAPP_WEBHOOK_MODE=standalone)
// ═══════════════════════════════════════════════════════════════════
async function standaloneBotHandler(req: NextRequest) {
  try {
    const body = await req.json();

    // Extract message from Meta webhook payload
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    const contact = value?.contacts?.[0];

    // Status updates (delivered, read, etc.) — just acknowledge
    if (!message || !message.from) {
      return NextResponse.json({ status: "EVENT_RECEIVED" }, { status: 200 });
    }

    const cleanDigits = message.from.replace(/\D/g, "");
    const fromNumber = `+${cleanDigits}`;
    const toWhatsApp = cleanDigits; // For sending replies
    const senderName = contact?.profile?.name || "Rider";

    // ─── Parse message content (text, interactive button, interactive list, button template) ───
    let messageText = "";
    let msgType = message.type || "text";
    let interactionId = ""; // For button/list reply IDs

    if (message.type === "text") {
      messageText = message.text?.body || "";
    } else if (message.type === "interactive") {
      const btn = message.interactive?.button_reply;
      const list = message.interactive?.list_reply;
      interactionId = btn?.id || list?.id || "";
      messageText = btn?.title || list?.title || interactionId || "Interactive Selection";
      msgType = "interactive";
    } else if (message.type === "button") {
      messageText = message.button?.text || message.button?.payload || "Button";
      msgType = "button";
    } else if (message.type === "image" || message.type === "document" || message.type === "audio" || message.type === "video") {
      messageText = `[${message.type} attachment]`;
      msgType = message.type;
    } else {
      messageText = "Hello";
    }

    // ─── 1. PERSIST INBOUND MESSAGE TO NEON DB ───
    let customerId: string;
    let conversationId: string;
    let controlMode: string;

    try {
      // Upsert customer
      const custRes = await query(
        `INSERT INTO customers (whatsapp_number, full_name)
         VALUES ($1, $2)
         ON CONFLICT (whatsapp_number) DO UPDATE
         SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, 'Rider'), customers.full_name),
             updated_at = CURRENT_TIMESTAMP
         RETURNING customer_id;`,
        [fromNumber, senderName]
      );
      customerId = custRes.rows[0].customer_id;

      // Upsert conversation
      const sessionId = `wa_${cleanDigits}`;
      const convRes = await query(
        `INSERT INTO conversations (customer_id, session_id, current_state, control_mode, current_intent)
         VALUES ($1, $2, 'BROWSING', 'AI_HANDLED', 'general_enquiry')
         ON CONFLICT (session_id) DO UPDATE
         SET last_user_message_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         RETURNING conversation_id, control_mode;`,
        [customerId, sessionId]
      );
      conversationId = convRes.rows[0].conversation_id;
      controlMode = convRes.rows[0].control_mode;

      // Save inbound message
      await query(
        `INSERT INTO messages (conversation_id, customer_id, direction, message_type, content, sender, whatsapp_message_id)
         VALUES ($1, $2, 'INBOUND', $3, $4, 'user', $5);`,
        [conversationId, customerId, msgType, messageText, message.id || null]
      );
    } catch (dbErr: any) {
      console.error("[DB Error]", dbErr.message);
      return NextResponse.json({ status: "EVENT_RECEIVED" }, { status: 200 });
    }

    // ─── 2. CHECK CONTROL MODE ───
    // If HUMAN_HANDOVER, don't send automated replies — staff handles it from dashboard
    if (controlMode === "HUMAN_HANDOVER") {
      console.log(`[Webhook] Conversation ${conversationId} is in HUMAN_HANDOVER mode. Skipping AI.`);
      return NextResponse.json({ status: "EVENT_RECEIVED" }, { status: 200 });
    }

    // ─── 3. HANDLE INTERACTIVE BUTTON/LIST CALLBACKS ───
    if (interactionId) {
      await handleInteractionCallback(interactionId, toWhatsApp, senderName, conversationId, customerId);
      return NextResponse.json({ status: "EVENT_RECEIVED" }, { status: 200 });
    }

    // ─── 4. HYBRID ROUTING: DETERMINISTIC INTENT → AI FALLBACK ───
    const intent = detectIntent(messageText);
    console.log(`[Webhook] Intent: ${intent} | Message: "${messageText}" | From: ${fromNumber}`);

    // Update conversation intent
    await query(
      `UPDATE conversations SET current_intent = $1, updated_at = CURRENT_TIMESTAMP WHERE conversation_id = $2;`,
      [intent.toLowerCase(), conversationId]
    ).catch(() => {});

    let replyText = "";

    switch (intent) {
      case "GREETING":
        // Send welcome with interactive buttons
        await sendButtonMessage(
          toWhatsApp,
          `Hello ${senderName}! 🐎 Welcome to *Gorai Equestrian Centre*, Mumbai!\n\nI'm your AI assistant. How can I help you today?`,
          [
            { id: "btn_services", title: "🏇 View Services" },
            { id: "btn_book", title: "📅 Book Session" },
            { id: "btn_contact", title: "📞 Contact Us" },
          ],
          "Gorai Equestrian Centre",
          "Powered by AI 🤖"
        );
        replyText = `[Interactive Buttons] Welcome message with 3 action buttons sent to ${senderName}`;
        break;

      case "VIEW_SERVICES":
      case "HELP":
        // Send service list
        await sendServicesList(toWhatsApp, senderName);
        replyText = `[Interactive List] Full services catalog sent to ${senderName}`;
        break;

      case "PRICING":
        await sendPricingResponse(toWhatsApp, senderName);
        replyText = `[Interactive Buttons] Pricing details with booking button sent to ${senderName}`;
        break;

      case "BOOK_SESSION":
        await sendButtonMessage(
          toWhatsApp,
          `Great choice, ${senderName}! 🏇\n\nTo book a riding session, use our secure booking form:\n\n👉 ${APP_URL}/checkout\n\n✅ Select your service\n✅ Enter your details\n✅ Confirm payment\n\nNeed help choosing? Reply "services" to see all options!`,
          [
            { id: "btn_services", title: "🏇 View Services" },
            { id: "btn_register", title: "📝 Register First" },
          ],
          "Book Your Session"
        );
        replyText = `[Interactive Buttons] Booking link with service/register buttons sent to ${senderName}`;
        break;

      case "REGISTER":
        await sendButtonMessage(
          toWhatsApp,
          `📝 *Rider Registration & Safety Form*\n\nBefore your first ride, please complete:\n• Personal details\n• Medical fitness declaration\n• Safety rules acknowledgement\n• Indemnity & media consent\n\n👉 ${APP_URL}/register\n\nThis is mandatory for all riders as per GEC safety policy.`,
          [
            { id: "btn_book", title: "📅 Book Session" },
            { id: "btn_safety", title: "🛡️ Safety Rules" },
          ],
          "Rider Registration"
        );
        replyText = `[Interactive Buttons] Registration form link sent to ${senderName}`;
        break;

      case "LOCATION":
        await sendTextMessage(
          toWhatsApp,
          `📍 *Gorai Equestrian Centre*\nKhajuriwadi, Gorai, Mumbai, Maharashtra – 400092\n\n🗺️ We are located in the serene Gorai area, away from city noise.\n\nFacilities:\n• 120' × 80' riding arena\n• 3 km scenic trail\n• Well-trained horses\n• Experienced trainers\n\n📞 Call for directions:\nSalma: +91 93220 13233\n\n🌐 ${APP_URL}`
        );
        replyText = `Location details sent to ${senderName}`;
        break;

      case "CONTACT":
        await sendTextMessage(
          toWhatsApp,
          `📞 *GEC Official Contacts:*\n\n• Salma Kuruwle: +91 93220 13233\n• Anushka Patil: +91 90219 39252\n• Mandar Khatt: +91 98191 00032\n\n📸 Instagram: @gorai_equestrian_centre\n🌐 Website: ${APP_URL}`
        );
        replyText = `Contact details sent to ${senderName}`;
        break;

      case "SAFETY":
        await sendTextMessage(
          toWhatsApp,
          `🛡️ *GEC Safety Rules (Mandatory):*\n\n1️⃣ Helmets must be worn AT ALL TIMES\n2️⃣ Follow trainer instructions strictly\n3️⃣ One rider per horse\n4️⃣ No smoking in arena/stable area\n5️⃣ Closed shoes ONLY (no slippers/sandals)\n6️⃣ Medical fitness declaration required\n\n⚠️ Horse riding involves inherent outdoor risks. All riders must sign the indemnity form.\n\n📝 Register & sign: ${APP_URL}/register`
        );
        replyText = `Safety rules sent to ${senderName}`;
        break;

      case "TRAIL_RIDE":
        await sendButtonMessage(
          toWhatsApp,
          `🌿 *Trail Ride Experience*\n\n• Duration: 45 minutes\n• Distance: 3 km scenic trail\n• Price: ₹1,500\n• Level: Experienced riders\n\nEnjoy horse-rider communication and natural rhythm outside the arena!\n\n👉 Book now: ${APP_URL}/checkout`,
          [
            { id: "btn_book", title: "📅 Book Trail Ride" },
            { id: "btn_services", title: "🏇 Other Services" },
          ],
          "Trail Ride – ₹1,500"
        );
        replyText = `Trail ride details with booking button sent to ${senderName}`;
        break;

      case "JUMPING":
        await sendButtonMessage(
          toWhatsApp,
          `🏇 *Jumping Training*\n\n• Duration: 45 minutes\n• Arena: 120' × 80'\n• Price: ₹3,000\n• Level: Experienced riders\n\nAdvanced training with horse changes based on heart rate monitoring for animal welfare.\n\n👉 Book now: ${APP_URL}/checkout`,
          [
            { id: "btn_book", title: "📅 Book Jumping" },
            { id: "btn_services", title: "🏇 Other Services" },
          ],
          "Jumping – ₹3,000"
        );
        replyText = `Jumping training details sent to ${senderName}`;
        break;

      case "BEGINNER":
        await sendButtonMessage(
          toWhatsApp,
          `🐎 *Beginner Options at GEC:*\n\n1️⃣ *Basic Course* – ₹15,000\n   15 sessions × 30 mins (over 40+ days)\n   Complete foundation course\n\n2️⃣ *1-Hour Session* – ₹1,500\n   60 mins across 2 different horses\n   Perfect for first-timers!\n\n👉 Book: ${APP_URL}/checkout`,
          [
            { id: "btn_book", title: "📅 Book Now" },
            { id: "btn_register", title: "📝 Register First" },
          ],
          "Beginner Riding"
        );
        replyText = `Beginner options sent to ${senderName}`;
        break;

      case "EXPERIENCED":
        await sendButtonMessage(
          toWhatsApp,
          `🏇 *Experienced Rider Options:*\n\n1️⃣ *1-Hour Session* – ₹2,000\n   60 mins, 2 horses, different rhythms\n\n2️⃣ *Jumping Training* – ₹3,000\n   45 mins in 120'×80' arena\n\n3️⃣ *Trail Ride* – ₹1,500\n   3 km scenic trail, 45 mins\n\n👉 Book: ${APP_URL}/checkout`,
          [
            { id: "btn_book", title: "📅 Book Now" },
            { id: "btn_services", title: "🏇 All Services" },
          ],
          "Experienced Riders"
        );
        replyText = `Experienced rider options sent to ${senderName}`;
        break;

      case "FAMILY":
        await sendButtonMessage(
          toWhatsApp,
          `👨‍👩‍👧‍👦 *Come Close to a Horse*\n\n• Price: ₹600 per person (min 5)\n• Duration: ~90 minutes\n• Includes: Grooming, horse care, 15-min ride, trainer session, tea & snacks\n\nPerfect for families, kids, and first-time visitors!\n\n👉 Book: ${APP_URL}/checkout`,
          [
            { id: "btn_book", title: "📅 Book Now" },
            { id: "btn_services", title: "🏇 Other Options" },
          ],
          "Family Experience – ₹600"
        );
        replyText = `Family experience details sent to ${senderName}`;
        break;

      case "UNKNOWN":
      default:
        // ─── AI FALLBACK: Send to Bedrock for intelligent response ───
        console.log(`[Webhook] UNKNOWN intent → Invoking AI for: "${messageText}"`);

        const aiReply = await generateAIResponse(messageText, conversationId, senderName);

        // Send AI response with follow-up buttons
        await sendButtonMessage(
          toWhatsApp,
          aiReply,
          [
            { id: "btn_services", title: "🏇 View Services" },
            { id: "btn_book", title: "📅 Book Session" },
          ],
          undefined,
          "AI-Powered Response 🤖"
        );
        replyText = `[AI Response] ${aiReply}`;
        break;
    }

    // ─── 5. LOG OUTBOUND REPLY TO DB ───
    try {
      await query(
        `INSERT INTO messages (conversation_id, customer_id, direction, message_type, content, sender)
         VALUES ($1, $2, 'OUTBOUND', 'text', $3, 'bot');`,
        [conversationId, customerId, replyText.slice(0, 5000)]
      );
    } catch (logErr: any) {
      console.error("[DB Log Error]", logErr.message);
    }

    return NextResponse.json({ status: "EVENT_RECEIVED" }, { status: 200 });
  } catch (error: any) {
    console.error("[Webhook POST Error]", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Handle Interactive Button/List Callbacks
// ═══════════════════════════════════════════════════════════════════
async function handleInteractionCallback(
  interactionId: string,
  toWhatsApp: string,
  senderName: string,
  conversationId: string,
  customerId: string
) {
  let replyText = "";

  switch (interactionId) {
    case "btn_services":
      await sendServicesList(toWhatsApp, senderName);
      replyText = `[Interactive List] Services catalog sent via button callback`;
      break;

    case "btn_book":
      await sendTextMessage(
        toWhatsApp,
        `📅 Book your session now, ${senderName}!\n\n👉 ${APP_URL}/checkout\n\n✅ Choose your service\n✅ Enter details\n✅ Confirm & pay\n\n📞 Need help? Call Salma: +91 93220 13233`
      );
      replyText = `Booking link sent via button callback`;
      break;

    case "btn_register":
      await sendTextMessage(
        toWhatsApp,
        `📝 Complete your rider registration:\n\n👉 ${APP_URL}/register\n\nThis includes medical fitness, safety rules, and indemnity declarations — mandatory before riding.`
      );
      replyText = `Registration link sent via button callback`;
      break;

    case "btn_contact":
      await sendTextMessage(
        toWhatsApp,
        `📞 *GEC Contacts:*\n• Salma: +91 93220 13233\n• Anushka: +91 90219 39252\n• Mandar: +91 98191 00032\n\n📸 IG: @gorai_equestrian_centre\n📍 Khajuriwadi, Gorai, Mumbai – 400092`
      );
      replyText = `Contact info sent via button callback`;
      break;

    case "btn_safety":
      await sendTextMessage(
        toWhatsApp,
        `🛡️ *Safety Rules:*\n1. Helmets mandatory\n2. Follow trainer instructions\n3. One rider per horse\n4. No smoking\n5. Closed shoes only\n6. Medical declaration required\n\n📝 ${APP_URL}/register`
      );
      replyText = `Safety rules sent via button callback`;
      break;

    // ─── Service-specific button callbacks ───
    case "svc_basic_course":
    case "svc_beginner_session":
    case "svc_experienced_session":
    case "svc_jumping_training":
    case "svc_trail_ride":
    case "svc_horse_experience":
      const serviceCode = interactionId.replace("svc_", "");
      await sendButtonMessage(
        toWhatsApp,
        `Great choice! ✅ To book this service:\n\n👉 ${APP_URL}/checkout\n\nSelect "${serviceCode.replace(/_/g, " ")}" on the booking page.\n\n📝 First-time rider? Register here first:\n${APP_URL}/register`,
        [
          { id: "btn_book", title: "📅 Book Now" },
          { id: "btn_register", title: "📝 Register" },
        ]
      );
      replyText = `Service ${serviceCode} selected → booking buttons sent`;
      break;

    default:
      // Unknown interaction → AI fallback
      const aiReply = await generateAIResponse(
        `User selected: ${interactionId}`,
        conversationId,
        senderName
      );
      await sendTextMessage(toWhatsApp, aiReply);
      replyText = `[AI] Unknown interaction "${interactionId}" → AI response sent`;
      break;
  }

  // Log outbound
  try {
    await query(
      `INSERT INTO messages (conversation_id, customer_id, direction, message_type, content, sender)
       VALUES ($1, $2, 'OUTBOUND', 'interactive', $3, 'bot');`,
      [conversationId, customerId, replyText.slice(0, 5000)]
    );
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Send Services List
// ═══════════════════════════════════════════════════════════════════
async function sendServicesList(toWhatsApp: string, senderName: string) {
  const services = await fetchServices();

  if (services.length === 0) {
    await sendTextMessage(
      toWhatsApp,
      `🏇 Our services:\n\n• Basic Course (15 sessions): ₹15,000\n• Beginner 1-Hr: ₹1,500\n• Experienced 1-Hr: ₹2,000\n• Jumping: ₹3,000\n• Trail Ride: ₹1,500\n• Family Horse Exp: ₹600/person\n\n👉 Book: ${APP_URL}/checkout`
    );
    return;
  }

  const rows = services.map((s: any) => ({
    id: `svc_${s.service_code}`,
    title: s.title.slice(0, 24),
    description: `₹${Number(s.price_inr).toLocaleString("en-IN")} | ${s.duration_minutes} mins | ${s.target_rider_level}`.slice(0, 72),
  }));

  await sendListMessage(
    toWhatsApp,
    `Hi ${senderName}! 🐎 Here are all our riding experiences at GEC.\n\nTap below to browse and select a service:`,
    "Browse Services",
    "GEC Services",
    rows,
    "Gorai Equestrian Centre",
    `Book at ${APP_URL}/checkout`
  );
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Send Pricing with Buttons
// ═══════════════════════════════════════════════════════════════════
async function sendPricingResponse(toWhatsApp: string, senderName: string) {
  const services = await fetchServices();

  let priceText = `💰 *Official GEC Rates:*\n\n`;
  if (services.length > 0) {
    priceText += services
      .map(
        (s: any) =>
          `• ${s.title}: ₹${Number(s.price_inr).toLocaleString("en-IN")}${s.sessions_count > 1 ? ` (${s.sessions_count} sessions)` : ""}`
      )
      .join("\n");
  } else {
    priceText += `• Basic Course (15 sessions): ₹15,000\n• Beginner Session (1 Hr): ₹1,500\n• Experienced Session: ₹2,000\n• Jumping Training: ₹3,000\n• Trail Ride: ₹1,500\n• Family Horse Exp: ₹600/person`;
  }

  priceText += `\n\n👉 Book & Pay: ${APP_URL}/checkout`;

  await sendButtonMessage(
    toWhatsApp,
    priceText,
    [
      { id: "btn_book", title: "📅 Book Now" },
      { id: "btn_services", title: "🏇 Service Details" },
    ],
    "Official Pricing",
    "Prices are locked & verified ✅"
  );
}

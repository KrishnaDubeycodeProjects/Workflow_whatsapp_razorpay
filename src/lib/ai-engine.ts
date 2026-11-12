import crypto from "crypto";
import { query } from "./db";

// ─── AWS BEDROCK CONFIG ───
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "";
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "google.gemma-2-9b-it";
const FALLBACK_MODEL_ID = process.env.BEDROCK_FALLBACK_MODEL_ID || "meta.llama3-8b-instruct-v1:0";

// ─── INTENT TYPES ───
export type Intent =
  | "GREETING"
  | "VIEW_SERVICES"
  | "PRICING"
  | "BOOK_SESSION"
  | "REGISTER"
  | "LOCATION"
  | "CONTACT"
  | "SAFETY"
  | "TRAIL_RIDE"
  | "JUMPING"
  | "BEGINNER"
  | "EXPERIENCED"
  | "FAMILY"
  | "HELP"
  | "UNKNOWN";

// ─── KEYWORD-BASED INTENT DETECTION ───
const INTENT_KEYWORDS: Record<Intent, string[]> = {
  GREETING: ["hi", "hello", "hey", "hii", "hiii", "namaste", "namaskar", "good morning", "good evening", "good afternoon", "start"],
  VIEW_SERVICES: ["services", "seva", "what do you offer", "activities", "what can i do", "options", "menu", "list", "show me", "browse"],
  PRICING: ["price", "rate", "cost", "kitna", "paisa", "amount", "fee", "charge", "how much", "kharcha", "package", "plan"],
  BOOK_SESSION: ["book", "booking", "reserve", "appointment", "slot", "checkout", "pay", "payment", "buy", "purchase"],
  REGISTER: ["register", "registration", "form", "waiver", "indemnity", "sign up", "signup", "enroll", "enrol"],
  LOCATION: ["location", "address", "where", "kahan", "direction", "map", "reach", "gorai", "khajuriwadi", "mumbai"],
  CONTACT: ["contact", "call", "phone", "number", "whatsapp", "salma", "anushka", "mandar"],
  SAFETY: ["safety", "safe", "helmet", "rules", "guideline", "precaution", "risk", "fitness", "medical"],
  TRAIL_RIDE: ["trail", "trail ride", "nature", "scenic", "outdoor", "outside arena", "beach"],
  JUMPING: ["jump", "jumping", "advanced", "arena"],
  BEGINNER: ["beginner", "beginer", "basic", "course", "learn", "learning", "first time", "new", "start riding", "shuru"],
  EXPERIENCED: ["experienced", "expert", "practice", "pro"],
  FAMILY: ["family", "group", "kids", "children", "come close", "horse experience", "grooming", "minor"],
  HELP: ["help", "support", "human", "agent", "talk to someone", "manager", "staff"],
  UNKNOWN: [],
};

export function detectIntent(text: string): Intent {
  const lower = text.toLowerCase().trim();

  // Score each intent by counting matching keywords
  let bestIntent: Intent = "UNKNOWN";
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === "UNKNOWN") continue;
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        // Longer keyword matches are more specific
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent as Intent;
    }
  }

  return bestIntent;
}

// ─── RAG: FETCH KNOWLEDGE BASE CONTEXT ───
export async function fetchRAGContext(userMessage: string): Promise<string> {
  try {
    // Fetch all active knowledge base articles
    const res = await query(
      `SELECT category, title, content FROM knowledge_base WHERE is_active = true ORDER BY category;`
    );

    if (res.rowCount === 0) return "";

    // Simple keyword relevance: score each article against the user message
    const lower = userMessage.toLowerCase();
    const scored = res.rows.map((row: any) => {
      const words = lower.split(/\s+/);
      let relevance = 0;
      for (const word of words) {
        if (word.length < 3) continue;
        if (row.title.toLowerCase().includes(word)) relevance += 3;
        if (row.content.toLowerCase().includes(word)) relevance += 1;
        if (row.category.toLowerCase().includes(word)) relevance += 2;
      }
      return { ...row, relevance };
    });

    // Take top 3 most relevant articles
    scored.sort((a: any, b: any) => b.relevance - a.relevance);
    const topArticles = scored.slice(0, 3).filter((a: any) => a.relevance > 0);

    if (topArticles.length === 0) {
      // If no keyword match, return the general business info + pricing
      const general = res.rows.filter(
        (r: any) => r.category === "business_info" || r.category === "pricing" || r.category === "contact"
      );
      return general.map((r: any) => `[${r.category}] ${r.title}: ${r.content}`).join("\n\n");
    }

    return topArticles.map((r: any) => `[${r.category}] ${r.title}: ${r.content}`).join("\n\n");
  } catch (err) {
    console.error("[RAG Context Error]", err);
    return "";
  }
}

// ─── FETCH SERVICES FROM DB ───
export async function fetchServices(): Promise<any[]> {
  try {
    const res = await query(
      `SELECT service_code, title, price_inr, duration_minutes, sessions_count, target_rider_level, description
       FROM services WHERE is_active = true ORDER BY price_inr ASC;`
    );
    return res.rows;
  } catch (err) {
    console.error("[Fetch Services Error]", err);
    return [];
  }
}

// ─── CONVERSATION HISTORY FOR AI CONTEXT ───
export async function fetchConversationHistory(conversationId: string, limit: number = 6): Promise<string> {
  try {
    const res = await query(
      `SELECT direction, sender, content FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT $2;`,
      [conversationId, limit]
    );

    if (res.rowCount === 0) return "";

    // Reverse to get chronological order
    const msgs = res.rows.reverse();
    return msgs
      .map((m: any) => `${m.direction === "INBOUND" ? "Customer" : "Bot"}: ${m.content}`)
      .join("\n");
  } catch (err) {
    return "";
  }
}

// ─── AWS SIGV4 HELPERS ───
function hmac(key: string | Buffer, str: string): Buffer {
  return crypto.createHmac("sha256", key).update(str).digest();
}

function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac("AWS4" + key, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

// ─── INVOKE AWS BEDROCK ───
async function invokeAwsBedrock(model: string, fullPrompt: string): Promise<string> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials not configured");
  }

  const host = `bedrock-runtime.${AWS_REGION}.amazonaws.com`;

  const requestBody = JSON.stringify({
    prompt: fullPrompt,
    max_tokens: 400,
    temperature: 0.3,
  });

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const method = "POST";
  const canonicalUri = `/model/${encodeURIComponent(model)}/invoke`;
  const canonicalQuerystring = "";
  const payloadHash = crypto.createHash("sha256").update(requestBody).digest("hex");

  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";

  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${AWS_REGION}/bedrock/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;

  const signingKey = getSignatureKey(AWS_SECRET_ACCESS_KEY, dateStamp, AWS_REGION, "bedrock");
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const authHeader = `${algorithm} Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}${canonicalUri}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: host,
      "X-Amz-Date": amzDate,
      Authorization: authHeader,
    },
    body: requestBody,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Bedrock HTTP ${res.status}: ${errText}`);
  }

  const resData = await res.json();
  return resData.generation || resData.outputs?.[0]?.text || resData.completion || JSON.stringify(resData);
}

// ─── MAIN AI GENERATE FUNCTION ───
export async function generateAIResponse(
  userMessage: string,
  conversationId: string,
  senderName: string
): Promise<string> {
  // 1. Fetch RAG context from knowledge_base
  const ragContext = await fetchRAGContext(userMessage);

  // 2. Fetch recent conversation history
  const history = await fetchConversationHistory(conversationId, 6);

  // 3. Build the full prompt
  const systemPrompt = `You are the official WhatsApp AI assistant for Gorai Equestrian Centre (GEC), located at Khajuriwadi, Gorai, Mumbai – 400092.

GROUNDED KNOWLEDGE (from our verified database):
${ragContext}

RECENT CONVERSATION:
${history}

STRICT RULES:
- Only provide information that is verified in the knowledge base above.
- Always recommend official booking link: https://goraiequestriancentre.vercel.app/checkout
- Always recommend registration form: https://goraiequestriancentre.vercel.app/register
- Never invent prices, services, or information not in the knowledge base.
- Be friendly, concise, and helpful. Use emojis sparingly (🐎 🏇 ✅).
- If you don't know something, say "For this specific query, please contact our team directly at +91 93220 13233 (Salma)."
- Keep responses under 200 words.
- Address the customer by name: ${senderName}.`;

  const fullPrompt = `<start_of_turn>user\n${systemPrompt}\n\nCustomer's message: ${userMessage}<end_of_turn>\n<start_of_turn>model\n`;

  // 4. Try primary model, then fallback, then grounded response
  try {
    const response = await invokeAwsBedrock(BEDROCK_MODEL_ID, fullPrompt);
    // Clean up any model artifacts
    const cleaned = response
      .replace(/<end_of_turn>/g, "")
      .replace(/<start_of_turn>/g, "")
      .trim();
    return cleaned || getFallbackGroundedResponse(userMessage, senderName);
  } catch (primaryErr: any) {
    console.warn(`[AI Primary Error] ${primaryErr.message}. Trying fallback...`);

    try {
      const response = await invokeAwsBedrock(FALLBACK_MODEL_ID, fullPrompt);
      const cleaned = response
        .replace(/<end_of_turn>/g, "")
        .replace(/<start_of_turn>/g, "")
        .trim();
      return cleaned || getFallbackGroundedResponse(userMessage, senderName);
    } catch (fallbackErr: any) {
      console.warn(`[AI Fallback Error] ${fallbackErr.message}. Using grounded knowledge.`);
      return getFallbackGroundedResponse(userMessage, senderName);
    }
  }
}

// ─── GROUNDED FALLBACK (WHEN BOTH AI MODELS FAIL) ───
function getFallbackGroundedResponse(userMessage: string, senderName: string): string {
  const lower = userMessage.toLowerCase();

  if (lower.includes("price") || lower.includes("rate") || lower.includes("cost") || lower.includes("kitna") || lower.includes("fee")) {
    return `Hi ${senderName}! 🐎 Here are the official GEC rates:\n\n• Basic Riding Course (15 sessions): ₹15,000\n• Beginner Session (1 Hr): ₹1,500\n• Experienced Session (1 Hr): ₹2,000\n• Jumping Training (45 mins): ₹3,000\n• Trail Ride (45 mins): ₹1,500\n• Come Close to Horse (Family): ₹600/person\n\n👉 Book now: https://goraiequestriancentre.vercel.app/checkout`;
  }

  if (lower.includes("location") || lower.includes("address") || lower.includes("where") || lower.includes("direction") || lower.includes("map")) {
    return `📍 Gorai Equestrian Centre\nKhajuriwadi, Gorai, Mumbai – 400092\n\n📞 Contact: Salma (+91 93220 13233)\n\n🌐 Visit: https://goraiequestriancentre.vercel.app`;
  }

  if (lower.includes("safety") || lower.includes("helmet") || lower.includes("rule")) {
    return `🛡️ GEC Safety Rules:\n\n1. Helmets mandatory at ALL times\n2. Follow trainer instructions strictly\n3. One rider per horse\n4. No smoking in arena/stable\n5. Closed shoes only (no slippers/sandals)\n6. Medical fitness declaration required\n\n📝 Register: https://goraiequestriancentre.vercel.app/register`;
  }

  if (lower.includes("contact") || lower.includes("call") || lower.includes("phone")) {
    return `📞 GEC Official Contacts:\n\n• Salma Kuruwle: +91 93220 13233\n• Anushka Patil: +91 90219 39252\n• Mandar Khatt: +91 98191 00032\n\n📸 Instagram: @gorai_equestrian_centre`;
  }

  return `Hi ${senderName}! 🐎 Welcome to Gorai Equestrian Centre!\n\nI can help you with:\n• 🏇 View our riding services & rates\n• 📝 Register as a rider\n• 📍 Our location & contact info\n• 🛡️ Safety guidelines\n\nOr ask me anything about horse riding at GEC!\n\n👉 Book: https://goraiequestriancentre.vercel.app/checkout\n📝 Register: https://goraiequestriancentre.vercel.app/register`;
}

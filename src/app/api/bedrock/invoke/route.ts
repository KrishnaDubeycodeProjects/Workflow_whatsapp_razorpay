import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

export const dynamic = "force-dynamic";

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "";
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "meta.llama3-8b-instruct-v1:0";

const bedrockClient = new BedrockRuntimeClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

interface KnowledgeRow {
  category: string;
  title: string;
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // 1. Extract raw question and language
    let rawText = "";
    if (body.userText && typeof body.userText === "string") {
      rawText = body.userText;
    } else if (body.prompt && typeof body.prompt === "string") {
      const match = body.prompt.match(/User message:\s*(.+?)(\. IMPORTANT|$)/i);
      rawText = match ? match[1].trim() : body.prompt;
    } else if (body.text && typeof body.text === "string") {
      rawText = body.text;
    } else if (body.messages && Array.isArray(body.messages)) {
      rawText = body.messages
        .map((m: any) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
        .join(" ");
    }

    rawText = rawText.trim();
    if (!rawText) rawText = "What riding sessions are available?";

    // Detect language
    let lang = body.language || "en";
    if (body.prompt && typeof body.prompt === "string") {
      const lMatch = body.prompt.match(/Respond in language '([a-z]{2})'/i);
      if (lMatch) lang = lMatch[1];
    }
    const lowerQuery = rawText.toLowerCase();
    if (/([\u0900-\u097F])/.test(rawText)) {
      if (/\b(à¤†à¤¹à¥‡|à¤†à¤¹à¥‹à¤¤|à¤¨à¤¾à¤¹à¥€|à¤•à¤§à¥€|à¤•à¤¸à¥‡|à¤•à¥ƒà¤ªà¤¯à¤¾|à¤¨à¤®à¤¸à¥à¤•à¤¾à¤°|à¤®à¤¾à¤¹à¤¿à¤¤à¥€|à¤˜à¥‹à¤¡à¤¾|à¤¸à¤µà¤¾à¤°à¥€)\b/.test(rawText)) {
        lang = "mr";
      } else {
        lang = "hi";
      }
    } else if (/\b(kya|hai|kitna|chahiye|hoga|mujhe|namaste|kripya|batao|karna|kaise)\b/i.test(lowerQuery)) {
      lang = "hi";
    } else if (/\b(aahe|kiti|mala|namaskar|kay|karaycha|aamhi|kadhi)\b/i.test(lowerQuery)) {
      lang = "mr";
    }

    // 2. Fetch full Grounded Knowledge Base from Neon DB
    let kbRows: KnowledgeRow[] = [];
    try {
      const kbRes = await query(
        `SELECT category, title, content FROM knowledge_base WHERE is_active = TRUE ORDER BY category ASC;`
      );
      kbRows = kbRes.rows || [];
    } catch (dbErr) {
      console.warn("DB knowledge base query notice:", dbErr);
    }

    // 3. Attempt AWS Bedrock live inference
    let generatedText = "";
    let usedModel = BEDROCK_MODEL_ID;

    try {
      const systemContext = kbRows
        .slice(0, 6)
        .map((r) => `${r.title}: ${r.content}`)
        .join("\n\n");

      const promptPayload = {
        prompt: `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\nYou are the official concierge for Gorai Equestrian Centre (GEC) in Mumbai. Keep your reply concise (2-3 sentences), warm, and informative. Use WhatsApp formatting (*bold*, â€¢ bullets, emojis ðŸŽ). Horses are Mumbai indigenous Sindhis. Answer in language: ${lang}.\n\nContext:\n${systemContext}<|eot_id|><|start_header_id|>user<|end_header_id|>\n${rawText}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n`,
        max_gen_len: 250,
        temperature: 0.3,
      };

      const cmd = new InvokeModelCommand({
        modelId: BEDROCK_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(promptPayload),
      });

      const bedrockRes = await bedrockClient.send(cmd);
      const resBody = JSON.parse(new TextDecoder().decode(bedrockRes.body));
      generatedText = resBody.generation || resBody.outputs?.[0]?.text || "";
    } catch (bedrockErr: any) {
      console.warn(`[Bedrock Inactive/Throttled]: ${bedrockErr.message}. Executing Dynamic Semantic RAG.`);
    }

    // 4. Dynamic Semantic RAG Engine across all Knowledge Base Articles
    if (!generatedText || generatedText.trim().length < 10) {
      usedModel = "GEC-Semantic-RAG-Engine";

      // Score each knowledge base article against user query terms
      const queryTokens = lowerQuery
        .replace(/[^\w\s\u0900-\u097F]/gi, " ")
        .split(/\s+/)
        .filter((t: string) => t.length > 2);

      let bestArticle: KnowledgeRow | null = null;
      let highestScore = 0;

      for (const row of kbRows) {
        let score = 0;
        const rowText = `${row.category} ${row.title} ${row.content}`.toLowerCase();
        for (const token of queryTokens) {
          if (rowText.includes(token)) {
            score += token.length > 4 ? 3 : 1;
          }
        }
        if (score > highestScore) {
          highestScore = score;
          bestArticle = row;
        }
      }

      // Check category intents with strict word boundaries
      const isKidIntent = /\b(kid|kids|child|children|bacha|bacche|family|age|varsh|umar|minor|minors)\b/i.test(lowerQuery);
      const isTimeIntent = /\b(time|timing|timings|hour|hours|samay|vel|batch|batches|morning|evening|sunset|sunrise|slot|slots)\b/i.test(lowerQuery);
      const isLocationIntent = /\b(location|address|kahan|kothe|reach|map|direction|directions|ferry|jetty|borivali|gorai)\b/i.test(lowerQuery);
      const isSafetyIntent = /\b(safe|safety|helmet|helmets|shoe|shoes|boot|boots|wear|cloth|clothes|kapde|dress|rule|rules|guideline|guidelines|attire)\b/i.test(lowerQuery);
      const isPriceIntent = /\b(price|pricing|rate|rates|cost|package|packages|fees|fee|charge|charges|plan|plans|kitna|kiti)\b/i.test(lowerQuery);
      const isRainIntent = /\b(rain|raining|rainy|barish|paus|monsoon|weather|cancel|cancellation|reschedule|rescheduling)\b/i.test(lowerQuery);
      const isContactIntent = /\b(contact|phone|number|call|manager|staff|salma|anushka|mandar|helpdesk|support)\b/i.test(lowerQuery);
      const isHorseIntent = /\b(horse|horses|ghoda|ghode|breed|breeds|sindhi|arena|trail|trails|trainer|trainers|coach|coaches|instructor|instructors)\b/i.test(lowerQuery);

      if (isKidIntent) {
        if (lang === "hi") {
          generatedText = `*à¤¬à¤šà¥à¤šà¥‹à¤‚ à¤”à¤° à¤ªà¤°à¤¿à¤µà¤¾à¤°à¥‹à¤‚ à¤•à¥‡ à¤²à¤¿à¤ à¤°à¤¾à¤‡à¤¡à¤¿à¤‚à¤—* ðŸŽ\n\nà¤¹à¤¾à¤, à¤¬à¤šà¥à¤šà¥‡ à¤¬à¤¿à¤²à¥à¤•à¥à¤² à¤­à¤¾à¤— à¤²à¥‡ à¤¸à¤•à¤¤à¥‡ à¤¹à¥ˆà¤‚! à¤¬à¤šà¥à¤šà¥‹à¤‚ à¤”à¤° à¤¶à¥à¤°à¥à¤†à¤¤à¥€ à¤°à¤¾à¤‡à¤¡à¤°à¥à¤¸ à¤•à¥‡ à¤²à¤¿à¤ à¤¹à¤®à¤¾à¤°à¤¾ *Come Close to a Horse* à¤…à¤¨à¥à¤­à¤µ (â‚¹600/à¤µà¥à¤¯à¤•à¥à¤¤à¤¿) à¤¸à¤°à¥à¤µà¥‹à¤¤à¥à¤¤à¤® à¤¹à¥ˆ, à¤œà¤¿à¤¸à¤®à¥‡à¤‚ à¤˜à¥‹à¤¡à¤¼à¥‹à¤‚ à¤•à¥€ à¤¦à¥‡à¤–à¤­à¤¾à¤², à¤¬à¥à¤°à¤¶à¤¿à¤‚à¤— à¤”à¤° à¤ªà¥ˆà¤¡à¥‰à¤• à¤®à¥‡à¤‚ à¤°à¤¾à¤‡à¤¡ à¤¶à¤¾à¤®à¤¿à¤² à¤¹à¥ˆà¥¤\nâ€¢ ðŸ›¡ï¸ 18 à¤µà¤°à¥à¤· à¤¸à¥‡ à¤•à¤® à¤‰à¤®à¥à¤° à¤•à¥‡ à¤¬à¤šà¥à¤šà¥‹à¤‚ à¤•à¥‡ à¤²à¤¿à¤ à¤…à¤­à¤¿à¤­à¤¾à¤µà¤• à¤•à¥€ à¤¸à¤¹à¤®à¤¤à¤¿ à¤…à¤¨à¤¿à¤µà¤¾à¤°à¥à¤¯ à¤¹à¥ˆà¥¤\nâ€¢ ðŸª– à¤¸à¤­à¥€ à¤•à¥‹ à¤¸à¥à¤°à¤•à¥à¤·à¤¾ à¤¹à¥‡à¤²à¤®à¥‡à¤Ÿ à¤¸à¥‡à¤‚à¤Ÿà¤° à¤¦à¥à¤µà¤¾à¤°à¤¾ à¤¦à¤¿à¤¯à¤¾ à¤œà¤¾à¤¤à¤¾ à¤¹à¥ˆà¥¤`;
        } else if (lang === "mr") {
          generatedText = `*à¤®à¥à¤²à¤¾à¤‚à¤¸à¤¾à¤ à¥€ à¤†à¤£à¤¿ à¤•à¥à¤Ÿà¥à¤‚à¤¬à¤¾à¤¸à¤¾à¤ à¥€ à¤°à¤¾à¤‡à¤¡à¤¿à¤‚à¤—* ðŸŽ\n\nà¤¹à¥‹à¤¯, à¤®à¥à¤²à¥‡ à¤¨à¤•à¥à¤•à¥€à¤š à¤¸à¤¹à¤­à¤¾à¤—à¥€ à¤¹à¥‹à¤Š à¤¶à¤•à¤¤à¤¾à¤¤! à¤²à¤¹à¤¾à¤¨ à¤®à¥à¤²à¤¾à¤‚à¤¸à¤¾à¤ à¥€ à¤†à¤£à¤¿ à¤¨à¤µà¤¶à¤¿à¤•à¥à¤¯à¤¾à¤‚à¤¸à¤¾à¤ à¥€ à¤†à¤®à¤šà¤¾ *Come Close to a Horse* à¤…à¤¨à¥à¤­à¤µ (â‚¹600/à¤µà¥à¤¯à¤•à¥à¤¤à¥€) à¤‰à¤¤à¥à¤¤à¤® à¤†à¤¹à¥‡, à¤œà¥à¤¯à¤¾à¤®à¤§à¥à¤¯à¥‡ à¤˜à¥‹à¤¡à¥à¤¯à¤¾à¤‚à¤šà¥€ à¤•à¤¾à¤³à¤œà¥€, à¤¬à¥à¤°à¤¶à¤¿à¤‚à¤— à¤†à¤£à¤¿ à¤ªà¥…à¤¡à¥‰à¤•à¤®à¤§à¥à¤¯à¥‡ à¤°à¤¾à¤‡à¤¡ à¤¸à¤®à¤¾à¤µà¤¿à¤·à¥à¤Ÿ à¤†à¤¹à¥‡.\nâ€¢ ðŸ›¡ï¸ 18 à¤µà¤°à¥à¤·à¤¾à¤‚à¤–à¤¾à¤²à¥€à¤² à¤®à¥à¤²à¤¾à¤‚à¤¸à¤¾à¤ à¥€ à¤ªà¤¾à¤²à¤•à¤¾à¤‚à¤šà¥€ à¤¸à¤‚à¤®à¤¤à¥€ à¤†à¤µà¤¶à¥à¤¯à¤• à¤†à¤¹à¥‡.\nâ€¢ ðŸª– à¤¸à¥à¤°à¤•à¥à¤·à¤¾ à¤¹à¥‡à¤²à¥à¤®à¥‡à¤Ÿ à¤¸à¥‡à¤‚à¤Ÿà¤°à¤¦à¥à¤µà¤¾à¤°à¥‡ à¤ªà¥à¤°à¤µà¤²à¥‡ à¤œà¤¾à¤¤à¥‡.`;
        } else {
          generatedText = `*Children & Family Riding at GEC* ðŸŽ\n\nYes, children are warmly welcome! For young riders and families, our *Come Close to a Horse* experience (â‚¹600/person) is idealâ€”featuring gentle equine bonding, grooming, feeding, and guided paddock rides.\nâ€¢ ðŸ›¡ï¸ Minors (under 18) require parent/guardian digital waiver consent.\nâ€¢ ðŸª– Certified safety helmets are provided for all riders.`;
        }
      } else if (isSafetyIntent) {
        if (lang === "hi") {
          generatedText = `*à¤¸à¥à¤°à¤•à¥à¤·à¤¾ à¤¨à¤¿à¤¯à¤® à¤”à¤° à¤ªà¥‹à¤¶à¤¾à¤• à¤¦à¤¿à¤¶à¤¾à¤¨à¤¿à¤°à¥à¤¦à¥‡à¤¶* ðŸª–\n\nâ€¢ ðŸ›¡ï¸ *à¤¹à¥‡à¤²à¤®à¥‡à¤Ÿ:* à¤¸à¤­à¥€ à¤°à¤¾à¤‡à¤¡à¤°à¥à¤¸ à¤•à¥‡ à¤²à¤¿à¤ CE/ASTM à¤ªà¥à¤°à¤®à¤¾à¤£à¤¿à¤¤ à¤¹à¥‡à¤²à¤®à¥‡à¤Ÿ à¤…à¤¨à¤¿à¤µà¤¾à¤°à¥à¤¯ à¤¹à¥ˆ (à¤¸à¥‡à¤‚à¤Ÿà¤° à¤¦à¥à¤µà¤¾à¤°à¤¾ à¤ªà¥à¤°à¤¦à¤¾à¤¨ à¤•à¤¿à¤¯à¤¾ à¤œà¤¾à¤¤à¤¾ à¤¹à¥ˆ)à¥¤\nâ€¢ ðŸ‘Ÿ *à¤œà¥‚à¤¤à¥‡:* à¤¬à¤‚à¤¦ à¤œà¥‚à¤¤à¥‡ à¤¯à¤¾ à¤¬à¥‚à¤Ÿ à¤ªà¤¹à¤¨à¤¨à¤¾ à¤…à¤¨à¤¿à¤µà¤¾à¤°à¥à¤¯ à¤¹à¥ˆà¥¤ à¤šà¤ªà¥à¤ªà¤² à¤¯à¤¾ à¤¸à¥ˆà¤‚à¤¡à¤² à¤•à¥€ à¤…à¤¨à¥à¤®à¤¤à¤¿ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤\nâ€¢ ðŸ‘– *à¤•à¤ªà¤¡à¤¼à¥‡:* à¤†à¤°à¤¾à¤®à¤¦à¤¾à¤¯à¤• à¤²à¤‚à¤¬à¥€ à¤ªà¥ˆà¤‚à¤Ÿ à¤¯à¤¾ à¤¬à¥à¤°à¥€à¤šà¥‡à¤¸ à¤ªà¤¹à¤¨à¥‡à¤‚à¥¤\nâ€¢ ðŸ‘¨â€ðŸ« à¤¹à¤° à¤¸à¤¤à¥à¤° à¤…à¤¨à¥à¤­à¤µà¥€ à¤ªà¥à¤°à¤¶à¤¿à¤•à¥à¤·à¤•à¥‹à¤‚ à¤•à¥€ à¤¦à¥‡à¤–à¤°à¥‡à¤– à¤®à¥‡à¤‚ à¤¹à¥‹à¤¤à¤¾ à¤¹à¥ˆà¥¤`;
        } else if (lang === "mr") {
          generatedText = `*à¤¸à¥à¤°à¤•à¥à¤·à¤¾ à¤¨à¤¿à¤¯à¤® à¤†à¤£à¤¿ à¤•à¤ªà¤¡à¥à¤¯à¤¾à¤‚à¤šà¥‡ à¤¨à¤¿à¤¯à¤®* ðŸª–\n\nâ€¢ ðŸ›¡ï¸ *à¤¹à¥‡à¤²à¥à¤®à¥‡à¤Ÿ:* à¤¸à¤°à¥à¤µ à¤°à¤¾à¤‡à¤¡à¤°à¥à¤¸à¤¸à¤¾à¤ à¥€ à¤ªà¥à¤°à¤®à¤¾à¤£à¤¿à¤¤ à¤¹à¥‡à¤²à¥à¤®à¥‡à¤Ÿ à¤…à¤¨à¤¿à¤µà¤¾à¤°à¥à¤¯ à¤†à¤¹à¥‡ (à¤¸à¥‡à¤‚à¤Ÿà¤°à¤¦à¥à¤µà¤¾à¤°à¥‡ à¤ªà¥à¤°à¤µà¤²à¥‡ à¤œà¤¾à¤¤à¥‡).\nâ€¢ ðŸ‘Ÿ *à¤ªà¤¾à¤¦à¤¤à¥à¤°à¤¾à¤£à¥‡:* à¤¬à¤‚à¤¦ à¤¬à¥‚à¤Ÿ à¤•à¤¿à¤‚à¤µà¤¾ à¤¶à¥‚à¤œ à¤˜à¤¾à¤²à¤£à¥‡ à¤†à¤µà¤¶à¥à¤¯à¤• à¤†à¤¹à¥‡.\nâ€¢ ðŸ‘– *à¤•à¤ªà¤¡à¥‡:* à¤†à¤°à¤¾à¤®à¤¦à¤¾à¤¯à¤• à¤²à¤¾à¤‚à¤¬ à¤ªà¤à¤Ÿ à¤ªà¤°à¤¿à¤§à¤¾à¤¨ à¤•à¤°à¤¾.\nâ€¢ ðŸ‘¨â€ðŸ« à¤ªà¥à¤°à¤¤à¥à¤¯à¥‡à¤• à¤¸à¤¤à¥à¤°à¤¾à¤¤ à¤¤à¤œà¥à¤œà¥à¤ž à¤ªà¥à¤°à¤¶à¤¿à¤•à¥à¤·à¤• à¤‰à¤ªà¤¸à¥à¤¥à¤¿à¤¤ à¤…à¤¸à¤¤à¤¾à¤¤.`;
        } else {
          generatedText = `*Safety Guidelines & Dress Code* ðŸª–\n\nâ€¢ ðŸ›¡ï¸ *Helmets:* CE/ASTM certified equestrian helmets are mandatory and provided on-site for all riders.\nâ€¢ ðŸ‘Ÿ *Footwear:* Closed-toe shoes or boots are strictly required (no sandals or slip-ons).\nâ€¢ ðŸ‘– *Attire:* Comfortable full-length trousers or riding tights.\nâ€¢ ðŸ‘¨â€ðŸ« Every ride is supervised by experienced GEC equine instructors.`;
        }
      } else if (isTimeIntent) {
        if (lang === "hi") {
          generatedText = `*à¤—à¥‹à¤°à¤¾à¤ˆ à¤‡à¤•à¥à¤µà¥‡à¤¸à¥à¤Ÿà¥à¤°à¤¿à¤¯à¤¨ à¤¸à¥‡à¤‚à¤Ÿà¤° à¤•à¤¾ à¤¸à¤®à¤¯ à¤”à¤° à¤¬à¥ˆà¤š* â°\n\nà¤˜à¥‹à¤¡à¤¼à¥‹à¤‚ à¤•à¥€ à¤­à¤²à¤¾à¤ˆ à¤”à¤° à¤†à¤°à¤¾à¤®à¤¦à¤¾à¤¯à¤• à¤®à¥Œà¤¸à¤® à¤•à¥‡ à¤²à¤¿à¤ à¤¹à¤®à¤¾à¤°à¥‡ à¤¸à¤¤à¥à¤° à¤ªà¥à¤°à¤¤à¤¿à¤¦à¤¿à¤¨ à¤¦à¥‹ à¤¸à¥à¤²à¥‰à¤Ÿ à¤®à¥‡à¤‚ à¤šà¤²à¤¤à¥‡ à¤¹à¥ˆà¤‚:\nâ€¢ ðŸŒ… *à¤¸à¥à¤¬à¤¹ à¤•à¤¾ à¤—à¥‹à¤²à¥à¤¡à¤¨ à¤‘à¤µà¤°:* 6:00 AM â€“ 10:00 AM (à¤®à¥à¤–à¥à¤¯ à¤¸à¥à¤²à¥‰à¤Ÿ: 6:30 AM â€“ 9:30 AM)\nâ€¢ ðŸŒ‡ *à¤¶à¤¾à¤® à¤•à¤¾ à¤¸à¤¨à¤¸à¥‡à¤Ÿ à¤¬à¥ˆà¤š:* 4:00 PM â€“ 7:00 PM\nâ€¢ ðŸ“ à¤–à¤œà¥à¤°à¥€à¤µà¤¾à¤¡à¤¼à¥€, à¤—à¥‹à¤°à¤¾à¤ˆ, à¤®à¥à¤‚à¤¬à¤ˆ`;
        } else if (lang === "mr") {
          generatedText = `*à¤—à¥‹à¤°à¤¾à¤ˆ à¤‡à¤•à¥à¤µà¥‡à¤¸à¥à¤Ÿà¥à¤°à¤¿à¤¯à¤¨ à¤¸à¥‡à¤‚à¤Ÿà¤°à¤šà¥à¤¯à¤¾ à¤µà¥‡à¤³à¤¾ à¤†à¤£à¤¿ à¤¬à¥…à¤šà¥‡à¤¸* â°\n\nà¤˜à¥‹à¤¡à¥à¤¯à¤¾à¤‚à¤šà¥€ à¤•à¤¾à¤³à¤œà¥€ à¤†à¤£à¤¿ à¤¨à¤¿à¤¸à¤°à¥à¤—à¤°à¤®à¥à¤¯ à¤µà¤¾à¤¤à¤¾à¤µà¤°à¤£ à¤²à¤•à¥à¤·à¤¾à¤¤ à¤˜à¥‡à¤Šà¤¨ à¤†à¤®à¤šà¥‡ à¤¸à¤¤à¥à¤° à¤¦à¤°à¤°à¥‹à¤œ à¤¦à¥‹à¤¨ à¤¸à¥à¤²à¥‰à¤Ÿà¤®à¤§à¥à¤¯à¥‡ à¤šà¤¾à¤²à¤¤à¤¾à¤¤:\nâ€¢ ðŸŒ… *à¤¸à¤•à¤¾à¤³à¤šà¥€ à¤µà¥‡à¤³:* 6:00 AM â€“ 10:00 AM (à¤ªà¥à¤°à¤®à¥à¤– à¤µà¥‡à¤³: 6:30 AM â€“ 9:30 AM)\nâ€¢ ðŸŒ‡ *à¤¸à¤‚à¤§à¥à¤¯à¤¾à¤•à¤¾à¤³à¤šà¥€ à¤µà¥‡à¤³:* 4:00 PM â€“ 7:00 PM\nâ€¢ ðŸ“ à¤–à¤œà¥à¤°à¥€à¤µà¤¾à¤¡à¥€, à¤—à¥‹à¤°à¤¾à¤ˆ, à¤®à¥à¤‚à¤¬à¤ˆ`;
        } else {
          generatedText = `*GEC Operating Hours & Batches* â°\n\nTo ensure optimal equine welfare and cool coastal weather, our riding sessions run daily in two prime batches:\nâ€¢ ðŸŒ… *Morning Golden Hour:* 6:00 AM â€“ 10:00 AM (Prime: 6:30 AM â€“ 9:30 AM)\nâ€¢ ðŸŒ‡ *Evening Sunset Batch:* 4:00 PM â€“ 7:00 PM\n\nDaily 1-hour sessions are available in our professional 120x80 sand arena and coastal trails.`;
        }
      } else if (isLocationIntent) {
        if (lang === "hi") {
          generatedText = `*à¤—à¥‹à¤°à¤¾à¤ˆ à¤‡à¤•à¥à¤µà¥‡à¤¸à¥à¤Ÿà¥à¤°à¤¿à¤¯à¤¨ à¤¸à¥‡à¤‚à¤Ÿà¤° à¤•à¤¾ à¤ªà¤¤à¤¾ à¤”à¤° à¤ªà¤¹à¥à¤à¤šà¤¨à¥‡ à¤•à¤¾ à¤®à¤¾à¤°à¥à¤—* ðŸ“\n\nâ€¢ *à¤ªà¤¤à¤¾:* à¤–à¤œà¥à¤°à¥€à¤µà¤¾à¤¡à¤¼à¥€, à¤—à¥‹à¤°à¤¾à¤ˆ à¤—à¤¾à¤à¤µ, à¤¬à¥‹à¤°à¤¿à¤µà¤²à¥€ à¤µà¥‡à¤¸à¥à¤Ÿ, à¤®à¥à¤‚à¤¬à¤ˆ â€“ 400092\nâ€¢ ðŸš¢ *à¤•à¥ˆà¤¸à¥‡ à¤ªà¤¹à¥à¤à¤šà¥‡à¤‚:* à¤¬à¥‹à¤°à¤¿à¤µà¤²à¥€ à¤µà¥‡à¤¸à¥à¤Ÿ à¤¸à¥‡ à¤—à¥‹à¤°à¤¾à¤ˆ à¤œà¥‡à¤Ÿà¥€ à¤•à¥‡ à¤²à¤¿à¤ 5 à¤®à¤¿à¤¨à¤Ÿ à¤•à¥€ à¤«à¥‡à¤°à¥€ à¤²à¥‡à¤‚, à¤«à¤¿à¤° à¤–à¤œà¥à¤°à¥€à¤µà¤¾à¤¡à¤¼à¥€ à¤•à¥‡ à¤²à¤¿à¤ 10 à¤®à¤¿à¤¨à¤Ÿ à¤•à¤¾ à¤‘à¤Ÿà¥‹/à¤•à¥ˆà¤¬à¥¤\nâ€¢ ðŸ“ž *à¤¸à¤¹à¤¾à¤¯à¤¤à¤¾:* +91 93220 13233 (à¤¸à¤²à¤®à¤¾) / +91 90219 39252 (à¤…à¤¨à¥à¤·à¥à¤•à¤¾)`;
        } else if (lang === "mr") {
          generatedText = `*à¤—à¥‹à¤°à¤¾à¤ˆ à¤‡à¤•à¥à¤µà¥‡à¤¸à¥à¤Ÿà¥à¤°à¤¿à¤¯à¤¨ à¤¸à¥‡à¤‚à¤Ÿà¤°à¤šà¤¾ à¤ªà¤¤à¥à¤¤à¤¾ à¤†à¤£à¤¿ à¤®à¤¾à¤°à¥à¤—* ðŸ“\n\nâ€¢ *à¤ªà¤¤à¥à¤¤à¤¾:* à¤–à¤œà¥à¤°à¥€à¤µà¤¾à¤¡à¥€, à¤—à¥‹à¤°à¤¾à¤ˆ à¤—à¤¾à¤µ, à¤¬à¥‹à¤°à¤¿à¤µà¤²à¥€ à¤ªà¤¶à¥à¤šà¤¿à¤®, à¤®à¥à¤‚à¤¬à¤ˆ â€“ 400092\nâ€¢ ðŸš¢ *à¤•à¤¸à¥‡ à¤ªà¥‹à¤¹à¥‹à¤šà¤¾à¤µà¥‡:* à¤¬à¥‹à¤°à¤¿à¤µà¤²à¥€ à¤ªà¤¶à¥à¤šà¤¿à¤®à¥‡à¤•à¤¡à¥‚à¤¨ à¤—à¥‹à¤°à¤¾à¤ˆ à¤œà¥‡à¤Ÿà¥à¤Ÿà¥€à¤¸à¤¾à¤ à¥€ 5 à¤®à¤¿à¤¨à¤¿à¤Ÿà¤¾à¤‚à¤šà¥€ à¤«à¥‡à¤°à¥€ à¤˜à¥à¤¯à¤¾, à¤¨à¤‚à¤¤à¤° à¤–à¤œà¥à¤°à¥€à¤µà¤¾à¤¡à¥€à¤¸à¤¾à¤ à¥€ 10 à¤®à¤¿à¤¨à¤¿à¤Ÿà¤¾à¤‚à¤šà¤¾ à¤‘à¤Ÿà¥‹/à¤•à¥…à¤¬.\nâ€¢ ðŸ“ž *à¤®à¤¦à¤¤ à¤•à¤•à¥à¤·:* +91 93220 13233 (à¤¸à¤²à¤®à¤¾)`;
        } else {
          generatedText = `*GEC Location & How to Reach* ðŸ“\n\nâ€¢ *Address:* Khajuriwadi, Gorai Village, Borivali West, Mumbai â€“ 400092\nâ€¢ ðŸš¢ *How to Reach:* Take the 5-minute passenger ferry from Borivali West to Gorai Jetty, then a 10-minute auto/cab to Khajuriwadi.\nâ€¢ ðŸ“ž *Helpdesk:* +91 93220 13233 (Salma) / +91 90219 39252 (Anushka)`;
        }
      } else if (isPriceIntent) {
        if (lang === "hi") {
          generatedText = `*à¤—à¥‹à¤°à¤¾à¤ˆ à¤‡à¤•à¥à¤µà¥‡à¤¸à¥à¤Ÿà¥à¤°à¤¿à¤¯à¤¨ à¤¸à¥‡à¤‚à¤Ÿà¤° à¤†à¤§à¤¿à¤•à¤¾à¤°à¤¿à¤• à¤¦à¤°à¥‡à¤‚* ðŸŽ\n\nâ€¢ ðŸ´ *Come Close to a Horse (90 à¤®à¤¿à¤¨à¤Ÿ):* â‚¹600 (à¤¬à¥à¤°à¤¶à¤¿à¤‚à¤— à¤µ à¤°à¤¾à¤‡à¤¡)\nâ€¢ ðŸ“‹ *Beginner Session (1 à¤˜à¤‚à¤Ÿà¤¾):* â‚¹1,500\nâ€¢ ðŸŒ¿ *Trail Ride (45 à¤®à¤¿à¤¨à¤Ÿ à¤¤à¤Ÿà¥€à¤¯ à¤Ÿà¥à¤°à¥‡à¤²):* â‚¹1,500\nâ€¢ ðŸ‡ *Experienced Rider (1 à¤˜à¤‚à¤Ÿà¤¾):* â‚¹2,000\nâ€¢ ðŸ† *Jumping Training (45 à¤®à¤¿à¤¨à¤Ÿ):* â‚¹3,000\nâ€¢ ðŸŽ–ï¸ *Basic Riding Course (10 à¤¸à¤¤à¥à¤°):* â‚¹15,000\n\nðŸ‘‰ à¤¸à¥à¤²à¥‰à¤Ÿ à¤¬à¥à¤• à¤•à¤°à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤¨à¥€à¤šà¥‡ à¤¦à¤¿à¤ à¤—à¤ à¤¬à¤Ÿà¤¨ à¤ªà¤° à¤Ÿà¥ˆà¤ª à¤•à¤°à¥‡à¤‚!`;
        } else if (lang === "mr") {
          generatedText = `*à¤—à¥‹à¤°à¤¾à¤ˆ à¤‡à¤•à¥à¤µà¥‡à¤¸à¥à¤Ÿà¥à¤°à¤¿à¤¯à¤¨ à¤¸à¥‡à¤‚à¤Ÿà¤° à¤…à¤§à¤¿à¤•à¥ƒà¤¤ à¤¦à¤°à¤ªà¤¤à¥à¤°à¤•* ðŸŽ\n\nâ€¢ ðŸ´ *Come Close to a Horse (90 à¤®à¤¿à¤¨à¤¿à¤Ÿà¥‡):* â‚¹600\nâ€¢ ðŸ“‹ *Beginner Session (1 à¤¤à¤¾à¤¸):* â‚¹1,500\nâ€¢ ðŸŒ¿ *Trail Ride (45 à¤®à¤¿à¤¨à¤¿à¤Ÿà¥‡ à¤¸à¤¾à¤—à¤°à¥€ à¤Ÿà¥à¤°à¥‡à¤²):* â‚¹1,500\nâ€¢ ðŸ‡ *Experienced Rider (1 à¤¤à¤¾à¤¸):* â‚¹2,000\nâ€¢ ðŸ† *Jumping Training (45 à¤®à¤¿à¤¨à¤¿à¤Ÿà¥‡):* â‚¹3,000\nâ€¢ ðŸŽ–ï¸ *Basic Riding Course (10 à¤¸à¤¤à¥à¤°à¥‡):* â‚¹15,000\n\nðŸ‘‰ à¤¸à¥à¤²à¥‰à¤Ÿ à¤¬à¥à¤• à¤•à¤°à¤£à¥à¤¯à¤¾à¤¸à¤¾à¤ à¥€ à¤–à¤¾à¤²à¥€à¤² à¤¬à¤Ÿà¤¨à¤¾à¤µà¤° à¤Ÿà¥…à¤ª à¤•à¤°à¤¾!`;
        } else {
          generatedText = `*Official GEC Riding Sessions & Pricing* ðŸŽ\n\nâ€¢ ðŸ´ *Come Close to a Horse:* â‚¹600 (Grooming, bonding & ride)\nâ€¢ ðŸ“‹ *Beginner Session (1 Hour):* â‚¹1,500\nâ€¢ ðŸŒ¿ *Scenic Coastal Trail Ride (45 Mins):* â‚¹1,500\nâ€¢ ðŸ‡ *Experienced Rider Session (1 Hour):* â‚¹2,000\nâ€¢ ðŸ† *Jumping Training (45 Mins):* â‚¹3,000\nâ€¢ ðŸŽ–ï¸ *Basic Course (10 Sessions):* â‚¹15,000\n\nTap below to select a plan and check available dates!`;
        }
      } else if (isRainIntent) {
        if (lang === "hi") {
          generatedText = `*à¤¬à¤¾à¤°à¤¿à¤¶ à¤”à¤° à¤°à¤¿à¤¶à¥‡à¤¡à¥à¤¯à¥‚à¤²à¤¿à¤‚à¤— à¤¨à¥€à¤¤à¤¿* ðŸŒ§ï¸\n\nà¤˜à¥‹à¤¡à¤¼à¥‹à¤‚ à¤•à¥‡ à¤–à¥à¤°à¥‹à¤‚ à¤”à¤° à¤à¤°à¤¿à¤¨à¤¾ à¤•à¥€ à¤¸à¥à¤°à¤•à¥à¤·à¤¾ à¤•à¥‡ à¤²à¤¿à¤ à¤­à¤¾à¤°à¥€ à¤¬à¤¾à¤°à¤¿à¤¶ à¤•à¥‡ à¤¦à¥Œà¤°à¤¾à¤¨ à¤¸à¤¤à¥à¤° à¤°à¥‹à¤• à¤¦à¤¿à¤ à¤œà¤¾à¤¤à¥‡ à¤¹à¥ˆà¤‚à¥¤ à¤†à¤ªà¤•à¤¾ à¤…à¤—à¥à¤°à¤¿à¤® à¤­à¥à¤—à¤¤à¤¾à¤¨ à¤•à¤­à¥€ à¤­à¥€ à¤µà¥à¤¯à¤°à¥à¤¥ à¤¨à¤¹à¥€à¤‚ à¤œà¤¾à¤¤à¤¾â€”à¤‰à¤¸à¥‡ à¤†à¤ªà¤•à¥€ à¤ªà¤¸à¤‚à¤¦ à¤•à¥€ à¤•à¤¿à¤¸à¥€ à¤­à¥€ à¤†à¤—à¤¾à¤®à¥€ à¤¤à¤¾à¤°à¥€à¤– à¤ªà¤° à¤¨à¤¿à¤ƒà¤¶à¥à¤²à¥à¤• à¤°à¤¿à¤¶à¥‡à¤¡à¥à¤¯à¥‚à¤² à¤•à¤° à¤¦à¤¿à¤¯à¤¾ à¤œà¤¾à¤¤à¤¾ à¤¹à¥ˆà¥¤`;
        } else if (lang === "mr") {
          generatedText = `*à¤ªà¤¾à¤µà¤¸à¤¾à¤³à¥€ à¤†à¤£à¤¿ à¤ªà¥à¤¨à¤°à¥à¤¨à¤¿à¤¯à¥‹à¤œà¤¨ à¤§à¥‹à¤°à¤£* ðŸŒ§ï¸\n\nà¤˜à¥‹à¤¡à¥à¤¯à¤¾à¤‚à¤šà¥à¤¯à¤¾ à¤¸à¥à¤°à¤•à¥à¤·à¥‡à¤¸à¤¾à¤ à¥€ à¤®à¥à¤¸à¤³à¤§à¤¾à¤° à¤ªà¤¾à¤µà¤¸à¤¾à¤¤ à¤¸à¤¤à¥à¤°à¥‡ à¤¥à¤¾à¤‚à¤¬à¤µà¤²à¥€ à¤œà¤¾à¤¤à¤¾à¤¤. à¤†à¤ªà¤²à¥‡ à¤ªà¥‚à¤°à¥à¤µ-à¤¨à¥‹à¤‚à¤¦à¤£à¥€ à¤¶à¥à¤²à¥à¤• à¤•à¤§à¥€à¤¹à¥€ à¤µà¤¾à¤¯à¤¾ à¤œà¤¾à¤¤ à¤¨à¤¾à¤¹à¥€â€”à¤†à¤ªà¤²à¥à¤¯à¤¾ à¤ªà¤¸à¤‚à¤¤à¥€à¤šà¥à¤¯à¤¾ à¤†à¤—à¤¾à¤®à¥€ à¤¤à¤¾à¤°à¤–à¥‡à¤µà¤° à¤¸à¤¤à¥à¤° à¤®à¥‹à¤«à¤¤ à¤ªà¥à¤¨à¤°à¥à¤¨à¤¿à¤¯à¥‹à¤œà¤¿à¤¤ à¤•à¥‡à¤²à¥‡ à¤œà¤¾à¤¤à¥‡.`;
        } else {
          generatedText = `*Rain Policy & Rescheduling* ðŸŒ§ï¸\n\nSessions are temporarily paused during heavy waterlogged rain for horse and arena safety. Pre-booked sessions are never forfeited; you can easily reschedule to any future available date without penalty.`;
        }
      } else if (isHorseIntent) {
        if (lang === "hi") {
          generatedText = `*à¤¹à¤®à¤¾à¤°à¥‡ à¤¸à¤¿à¤‚à¤§à¥€ à¤˜à¥‹à¤¡à¤¼à¥‡, à¤ªà¥à¤°à¤¶à¤¿à¤•à¥à¤·à¤• à¤”à¤° à¤à¤°à¤¿à¤¨à¤¾* ðŸŽ\n\nà¤—à¥‹à¤°à¤¾à¤ˆ à¤‡à¤•à¥à¤µà¥‡à¤¸à¥à¤Ÿà¥à¤°à¤¿à¤¯à¤¨ à¤¸à¥‡à¤‚à¤Ÿà¤° à¤®à¥à¤‚à¤¬à¤ˆ à¤•à¥‡ à¤ªà¥à¤°à¤¸à¤¿à¤¦à¥à¤§ à¤¦à¥‡à¤¶à¥€ à¤¸à¤¿à¤‚à¤§à¥€ à¤˜à¥‹à¤¡à¤¼à¥‹à¤‚ à¤•à¤¾ à¤˜à¤° à¤¹à¥ˆ, à¤œà¥‹ à¤…à¤ªà¤¨à¥‡ à¤¶à¤¾à¤‚à¤¤ à¤¸à¥à¤µà¤­à¤¾à¤µ, à¤¸à¤¹à¤¨à¤¶à¤•à¥à¤¤à¤¿ à¤”à¤° à¤¬à¥à¤¦à¥à¤§à¤¿à¤®à¤¤à¥à¤¤à¤¾ à¤•à¥‡ à¤²à¤¿à¤ à¤œà¤¾à¤¨à¥‡ à¤œà¤¾à¤¤à¥‡ à¤¹à¥ˆà¤‚à¥¤\nâ€¢ ðŸ‘¨â€ðŸ« à¤¹à¤®à¤¾à¤°à¥‡ à¤ªà¤¾à¤¸ à¤…à¤¨à¥à¤­à¤µà¥€ à¤µ à¤ªà¥à¤°à¤®à¤¾à¤£à¤¿à¤¤ à¤ªà¥à¤°à¤¶à¤¿à¤•à¥à¤·à¤• à¤¹à¥ˆà¤‚ à¤œà¥‹ à¤¹à¤° à¤°à¤¾à¤‡à¤¡à¤° à¤•à¤¾ à¤µà¥à¤¯à¤•à¥à¤¤à¤¿à¤—à¤¤ à¤®à¤¾à¤°à¥à¤—à¤¦à¤°à¥à¤¶à¤¨ à¤•à¤°à¤¤à¥‡ à¤¹à¥ˆà¤‚à¥¤\nâ€¢ ðŸŸï¸ 120ft x 80ft à¤•à¤¾ à¤µà¥à¤¯à¤¾à¤µà¤¸à¤¾à¤¯à¤¿à¤• à¤¸à¥ˆà¤‚à¤¡ à¤à¤°à¤¿à¤¨à¤¾\nâ€¢ ðŸŒ´ 3 à¤•à¤¿à¤®à¥€ à¤•à¤¾ à¤›à¤¾à¤¯à¤¾à¤¦à¤¾à¤° à¤¤à¤Ÿà¥€à¤¯ à¤°à¤¾à¤‡à¤¡à¤¿à¤‚à¤— à¤Ÿà¥à¤°à¥‡à¤²`;
        } else if (lang === "mr") {
          generatedText = `*à¤†à¤®à¤šà¥‡ à¤…à¤¸à¥à¤¸à¤² à¤¸à¤¿à¤‚à¤§à¥€ à¤˜à¥‹à¤¡à¥‡, à¤ªà¥à¤°à¤¶à¤¿à¤•à¥à¤·à¤• à¤†à¤£à¤¿ à¤…à¤°à¥‡à¤¨à¤¾* ðŸŽ\n\nà¤—à¥‹à¤°à¤¾à¤ˆ à¤‡à¤•à¥à¤µà¥‡à¤¸à¥à¤Ÿà¥à¤°à¤¿à¤¯à¤¨ à¤¸à¥‡à¤‚à¤Ÿà¤° à¤¹à¥‡ à¤®à¥à¤‚à¤¬à¤ˆà¤šà¥à¤¯à¤¾ à¤ªà¥à¤°à¤¸à¤¿à¤¦à¥à¤§ à¤¦à¥‡à¤¶à¥€ à¤¸à¤¿à¤‚à¤§à¥€ à¤˜à¥‹à¤¡à¥à¤¯à¤¾à¤‚à¤šà¥‡ à¤•à¥‡à¤‚à¤¦à¥à¤° à¤†à¤¹à¥‡, à¤œà¥‡ à¤¶à¤¾à¤‚à¤¤ à¤†à¤£à¤¿ à¤µà¤¿à¤¶à¥à¤µà¤¾à¤¸à¥‚ à¤¸à¥à¤µà¤­à¤¾à¤µà¤¾à¤¸à¤¾à¤ à¥€ à¤“à¤³à¤–à¤²à¥‡ à¤œà¤¾à¤¤à¤¾à¤¤.\nâ€¢ ðŸ‘¨â€ðŸ« à¤†à¤®à¤šà¥‡ à¤…à¤¨à¥à¤­à¤µà¥€ à¤ªà¥à¤°à¤¶à¤¿à¤•à¥à¤·à¤• à¤ªà¥à¤°à¤¤à¥à¤¯à¥‡à¤• à¤°à¤¾à¤‡à¤¡à¤°à¤šà¥‡ à¤µà¥ˆà¤¯à¤•à¥à¤¤à¤¿à¤• à¤®à¤¾à¤°à¥à¤—à¤¦à¤°à¥à¤¶à¤¨ à¤•à¤°à¤¤à¤¾à¤¤.\nâ€¢ ðŸŸï¸ 120ft x 80ft à¤šà¤¾ à¤­à¤µà¥à¤¯ à¤¸à¤à¤¡ à¤…à¤°à¥‡à¤¨à¤¾\nâ€¢ ðŸŒ´ 3 à¤•à¤¿à¤®à¥€ à¤šà¤¾ à¤¨à¤¿à¤¸à¤°à¥à¤—à¤°à¤®à¥à¤¯ à¤¸à¤¾à¤—à¤°à¥€ à¤°à¤¾à¤‡à¤¡à¤¿à¤‚à¤— à¤Ÿà¥à¤°à¥‡à¤²`;
        } else {
          generatedText = `*Indigenous Sindhi Horses, Trainers & Arena* ðŸŽ\n\nGorai Equestrian Centre is home to indigenous Mumbai Sindhi horses, celebrated for their gentle disposition, intelligence, and sure-footedness.\nâ€¢ ðŸ‘¨â€ðŸ« *Certified Trainers:* Experienced coaches provide 1-on-1 instruction for beginners and advanced riders.\nâ€¢ ðŸŸï¸ *120ft x 80ft Sand Arena:* Professional shock-absorbing footing.\nâ€¢ ðŸŒ´ *3km Scenic Coastal Trails:* Shaded trails under Gorai palm canopies.`;
        }
      } else if (isContactIntent) {
        if (lang === "hi") {
          generatedText = `*à¤—à¥‹à¤°à¤¾à¤ˆ à¤‡à¤•à¥à¤µà¥‡à¤¸à¥à¤Ÿà¥à¤°à¤¿à¤¯à¤¨ à¤¸à¥‡à¤‚à¤Ÿà¤° à¤¹à¥‡à¤²à¥à¤ªà¤¡à¥‡à¤¸à¥à¤•* ðŸ“ž\n\nà¤†à¤ª à¤¸à¥€à¤§à¥‡ à¤¹à¤®à¤¾à¤°à¥€ à¤Ÿà¥€à¤® à¤¸à¥‡ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤•à¤° à¤¸à¤•à¤¤à¥‡ à¤¹à¥ˆà¤‚:\nâ€¢ *à¤¸à¤²à¤®à¤¾ à¤•à¥à¤°à¥à¤µà¤²à¥‡:* +91 93220 13233\nâ€¢ *à¤…à¤¨à¥à¤·à¥à¤•à¤¾:* +91 90219 39252\nâ€¢ *à¤¸à¥à¤¥à¤¾à¤¨:* à¤–à¤œà¥à¤°à¥€à¤µà¤¾à¤¡à¤¼à¥€, à¤—à¥‹à¤°à¤¾à¤ˆ, à¤®à¥à¤‚à¤¬à¤ˆ â€“ 400092\n\nà¤¹à¤® à¤†à¤ªà¤•à¥€ à¤¸à¤¹à¤¾à¤¯à¤¤à¤¾ à¤•à¥‡ à¤²à¤¿à¤ à¤¸à¤¦à¥ˆà¤µ à¤¤à¤¤à¥à¤ªà¤° à¤¹à¥ˆà¤‚!`;
        } else if (lang === "mr") {
          generatedText = `*à¤—à¥‹à¤°à¤¾à¤ˆ à¤‡à¤•à¥à¤µà¥‡à¤¸à¥à¤Ÿà¥à¤°à¤¿à¤¯à¤¨ à¤¸à¥‡à¤‚à¤Ÿà¤° à¤¸à¤‚à¤ªà¤°à¥à¤•* ðŸ“ž\n\nà¤†à¤ªà¤£ à¤¥à¥‡à¤Ÿ à¤†à¤®à¤šà¥à¤¯à¤¾ à¤•à¤°à¥à¤®à¤šà¤¾à¤±à¥à¤¯à¤¾à¤‚à¤¶à¥€ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤¸à¤¾à¤§à¥‚ à¤¶à¤•à¤¤à¤¾:\nâ€¢ *à¤¸à¤²à¤®à¤¾:* +91 93220 13233\nâ€¢ *à¤…à¤¨à¥à¤·à¥à¤•à¤¾:* +91 90219 39252\nâ€¢ *à¤ªà¤¤à¥à¤¤à¤¾:* à¤–à¤œà¥à¤°à¥€à¤µà¤¾à¤¡à¥€, à¤—à¥‹à¤°à¤¾à¤ˆ, à¤®à¥à¤‚à¤¬à¤ˆ â€“ 400092`;
        } else {
          generatedText = `*GEC Front Desk & Support* ðŸ“ž\n\nFeel free to speak directly with our centre coordinators:\nâ€¢ *Salma Kuruwle:* +91 93220 13233\nâ€¢ *Anushka:* +91 90219 39252\nâ€¢ *Address:* Khajuriwadi, Gorai Village, Mumbai â€“ 400092\n\nWe are happy to answer any custom group or riding queries!`;
        }
      } else if (bestArticle && highestScore > 0) {
        // Grounded answer retrieved directly from matching article
        generatedText = `*${bestArticle.title}* ðŸŽ\n\n${bestArticle.content}`;
      } else {
        // Broad helpful contextual overview matching any unhandled inquiry
        if (lang === "hi") {
          generatedText = `*à¤—à¥‹à¤°à¤¾à¤ˆ à¤‡à¤•à¥à¤µà¥‡à¤¸à¥à¤Ÿà¥à¤°à¤¿à¤¯à¤¨ à¤¸à¥‡à¤‚à¤Ÿà¤°* ðŸŽ\n_à¤…à¤ªà¤¨à¥€ à¤—à¤¤à¤¿ à¤”à¤° à¤²à¤¯ à¤–à¥‹à¤œà¥‡à¤‚à¥¤_\n\nà¤¹à¤® à¤®à¥à¤‚à¤¬à¤ˆ à¤•à¥‡ à¤–à¤œà¥à¤°à¥€à¤µà¤¾à¤¡à¤¼à¥€, à¤—à¥‹à¤°à¤¾à¤ˆ à¤®à¥‡à¤‚ 120x80 à¤¸à¥ˆà¤‚à¤¡ à¤à¤°à¤¿à¤¨à¤¾ à¤”à¤° à¤¤à¤Ÿà¥€à¤¯ à¤Ÿà¥à¤°à¥‡à¤²à¥à¤¸ à¤ªà¤° à¤¦à¥ˆà¤¨à¤¿à¤• à¤°à¤¾à¤‡à¤¡à¤¿à¤‚à¤— à¤¸à¤¤à¥à¤° à¤ªà¥à¤°à¤¦à¤¾à¤¨ à¤•à¤°à¤¤à¥‡ à¤¹à¥ˆà¤‚à¥¤\nâ€¢ ðŸŒ… à¤¸à¥à¤¬à¤¹ (6:00 AM â€“ 10:00 AM) à¤”à¤° à¤¶à¤¾à¤® (4:00 PM â€“ 7:00 PM)\nâ€¢ ðŸª– à¤¸à¤­à¥€ à¤¸à¥à¤°à¤•à¥à¤·à¤¾ à¤—à¤¿à¤¯à¤° à¤”à¤° à¤ªà¥à¤°à¤¶à¤¿à¤•à¥à¤·à¤¿à¤¤ à¤•à¥‹à¤š à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¹à¥ˆà¤‚à¥¤\nâ€¢ ðŸ“ž à¤ªà¥‚à¤›à¤¤à¤¾à¤›: +91 93220 13233\n\nà¤†à¤ª à¤•à¥à¤¯à¤¾ à¤œà¤¾à¤¨à¤•à¤¾à¤°à¥€ à¤ªà¥à¤°à¤¾à¤ªà¥à¤¤ à¤•à¤°à¤¨à¤¾ à¤šà¤¾à¤¹à¥‡à¤‚à¤—à¥‡?`;
        } else if (lang === "mr") {
          generatedText = `*à¤—à¥‹à¤°à¤¾à¤ˆ à¤‡à¤•à¥à¤µà¥‡à¤¸à¥à¤Ÿà¥à¤°à¤¿à¤¯à¤¨ à¤¸à¥‡à¤‚à¤Ÿà¤°* ðŸŽ\n_à¤†à¤ªà¤²à¥€ à¤¸à¥à¤µà¤¤à¤ƒà¤šà¥€ à¤²à¤¯ à¤¶à¥‹à¤§à¤¾._\n\nà¤†à¤®à¥à¤¹à¥€ à¤–à¤œà¥à¤°à¥€à¤µà¤¾à¤¡à¥€, à¤—à¥‹à¤°à¤¾à¤ˆ à¤¯à¥‡à¤¥à¥‡ 120x80 à¤¸à¤à¤¡ à¤…à¤°à¥‡à¤¨à¤¾ à¤†à¤£à¤¿ à¤¸à¤¾à¤—à¤°à¥€ à¤Ÿà¥à¤°à¥‡à¤²à¥à¤¸à¤µà¤° à¤¦à¥ˆà¤¨à¤‚à¤¦à¤¿à¤¨ à¤˜à¥‹à¤¡à¥‡à¤¸à¥à¤µà¤¾à¤°à¥€ à¤¸à¤¤à¥à¤°à¥‡ à¤šà¤¾à¤²à¤µà¤¤à¥‹.\nâ€¢ ðŸŒ… à¤¸à¤•à¤¾à¤³ (6:00 AM â€“ 10:00 AM) à¤†à¤£à¤¿ à¤¸à¤‚à¤§à¥à¤¯à¤¾à¤•à¤¾à¤³ (4:00 PM â€“ 7:00 PM)\nâ€¢ ðŸª– à¤¸à¥à¤°à¤•à¥à¤·à¤¾ à¤¹à¥‡à¤²à¥à¤®à¥‡à¤Ÿ à¤†à¤£à¤¿ à¤®à¤¾à¤°à¥à¤—à¤¦à¤°à¥à¤¶à¤• à¤‰à¤ªà¤²à¤¬à¥à¤§.\nâ€¢ ðŸ“ž à¤®à¤¦à¤¤: +91 93220 13233`;
        } else {
          generatedText = `*Gorai Equestrian Centre* ðŸŽ\n_Away from the algorithm. Find your own rhythm._\n\nLocated in Khajuriwadi, Gorai, Mumbai, GEC offers private & beginner sessions with indigenous Sindhi horses in a 120x80 arena and scenic coastal trails.\nâ€¢ ðŸŒ… Daily Batches: 6:00 AM â€“ 10:00 AM & 4:00 PM â€“ 7:00 PM\nâ€¢ ðŸª– Full safety gear & certified instructors provided.\nâ€¢ ðŸ“ž Front Desk: +91 93220 13233\n\nHow can we help you plan your visit?`;
        }
      }
    }

    // Format clean WhatsApp response
    const cleanOutput = generatedText.replace(/\r\n/g, "\n").trim();

    return NextResponse.json({
      model: usedModel,
      region: AWS_REGION,
      generation: cleanOutput,
      response: cleanOutput,
      content: [
        {
          type: "text",
          text: cleanOutput,
        },
      ],
    });
  } catch (err: any) {
    console.error("AI Invoke Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

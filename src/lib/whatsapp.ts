// ─── WhatsApp Cloud API Interactive Message Builders ───
// Constraints: Button titles max 20 chars, list row titles max 24 chars,
// descriptions max 72 chars, body max 1024 chars, max 3 buttons, max 10 list rows

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

interface ButtonOption {
  id: string;
  title: string; // max 20 chars
}

interface ListRow {
  id: string;
  title: string; // max 24 chars
  description?: string; // max 72 chars
}

export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string; fileSize: number } | null> {
  if (!ACCESS_TOKEN) {
    console.warn("[WA Download] No ACCESS_TOKEN configured");
    return null;
  }

  try {
    // 1. Get media URL metadata from Meta Graph API
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    });

    if (!metaRes.ok) {
      const errText = await metaRes.text();
      console.error(`[WA Media Metadata Error] ${metaRes.status}: ${errText}`);
      return null;
    }

    const metaJson = await metaRes.json();
    const mediaUrl = metaJson.url;
    const mimeType = metaJson.mime_type || "image/jpeg";
    const fileSize = metaJson.file_size || 0;

    if (!mediaUrl) {
      console.error("[WA Media Metadata Error] No URL in response", metaJson);
      return null;
    }

    // 2. Download the binary media buffer (Meta requires Auth header for lookaside download)
    const fileRes = await fetch(mediaUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    });

    if (!fileRes.ok) {
      console.error(`[WA Media Download Error] ${fileRes.status}`);
      return null;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return { buffer, mimeType, fileSize: fileSize || buffer.length };
  } catch (err: any) {
    console.error("[WA Media Download Exception]", err.message);
    return null;
  }
}

// ─── SEND TEXT MESSAGE ───
export async function sendTextMessage(to: string, text: string): Promise<boolean> {
  if (!ACCESS_TOKEN) {
    console.warn("[WA] No ACCESS_TOKEN configured");
    return false;
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[WA Send Error] ${res.status}: ${errText}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[WA Send Error]", err.message);
    return false;
  }
}

// ─── SEND INTERACTIVE BUTTONS (max 3 buttons) ───
export async function sendButtonMessage(
  to: string,
  bodyText: string,
  buttons: ButtonOption[],
  headerText?: string,
  footerText?: string
): Promise<boolean> {
  if (!ACCESS_TOKEN) return false;

  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText.slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  };

  if (headerText) payload.interactive.header = { type: "text", text: headerText.slice(0, 60) };
  if (footerText) payload.interactive.footer = { text: footerText.slice(0, 60) };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[WA Button Error] ${res.status}: ${errText}`);
      // Fallback to text if interactive fails
      await sendTextMessage(to, bodyText);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[WA Button Error]", err.message);
    await sendTextMessage(to, bodyText);
    return false;
  }
}

// ─── SEND INTERACTIVE LIST (max 10 rows) ───
export async function sendListMessage(
  to: string,
  bodyText: string,
  buttonTitle: string,
  sectionTitle: string,
  rows: ListRow[],
  headerText?: string,
  footerText?: string
): Promise<boolean> {
  if (!ACCESS_TOKEN) return false;

  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText.slice(0, 1024) },
      action: {
        button: buttonTitle.slice(0, 20),
        sections: [
          {
            title: sectionTitle.slice(0, 24),
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              description: r.description?.slice(0, 72),
            })),
          },
        ],
      },
    },
  };

  if (headerText) payload.interactive.header = { type: "text", text: headerText.slice(0, 60) };
  if (footerText) payload.interactive.footer = { text: footerText.slice(0, 60) };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[WA List Error] ${res.status}: ${errText}`);
      await sendTextMessage(to, bodyText);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[WA List Error]", err.message);
    await sendTextMessage(to, bodyText);
    return false;
  }
}

// ─── SEND CTA URL MESSAGE ───
export async function sendCtaUrlMessage(
  to: string,
  headerText: string,
  bodyText: string,
  buttonText: string,
  url: string,
  footerText?: string
): Promise<boolean> {
  const cleanTo = to.replace(/\D/g, "");
  const payload = {
    messaging_product: "whatsapp",
    to: cleanTo,
    type: "interactive",
    interactive: {
      type: "cta_url",
      header: { type: "text", text: headerText.slice(0, 60) },
      body: { text: bodyText.slice(0, 1024) },
      footer: { text: (footerText || "Gorai Equestrian Centre 🐎").slice(0, 60) },
      action: {
        name: "cta_url",
        parameters: {
          display_text: buttonText.slice(0, 20),
          url: url
        }
      }
    }
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[WA CTA Error] ${res.status}: ${errText}`);
      await sendTextMessage(cleanTo, `${headerText}\n\n${bodyText}\n\n${buttonText}: ${url}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[WA CTA Error]", err.message);
    await sendTextMessage(cleanTo, `${headerText}\n\n${bodyText}\n\n${buttonText}: ${url}`);
    return false;
  }
}

// ─── SEND DOCUMENT (PDF TAX INVOICE) ───
export async function sendDocumentMessage(
  to: string,
  docUrl: string,
  filename: string,
  caption?: string
): Promise<boolean> {
  const cleanTo = to.replace(/\D/g, "");
  const payload = {
    messaging_product: "whatsapp",
    to: cleanTo,
    type: "document",
    document: {
      link: docUrl,
      filename: filename,
      caption: (caption || "Official Document").slice(0, 1024)
    }
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[WA Document Error] ${res.status}: ${errText}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[WA Document Error]", err.message);
    return false;
  }
}


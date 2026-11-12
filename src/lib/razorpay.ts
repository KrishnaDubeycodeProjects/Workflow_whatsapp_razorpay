import crypto from "crypto";
import Razorpay from "razorpay";

// ═══════════════════════════════════════════════════════════════════
// Razorpay (Standard Web Checkout) — server-only helpers.
// RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET must never reach the browser.
// ═══════════════════════════════════════════════════════════════════

export const RAZORPAY_MIN_AMOUNT_PAISE = 100;

let client: Razorpay | null = null;

export function getRazorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID || "";
}

export function getRazorpay(): Razorpay {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).");
  }
  if (!client) client = new Razorpay({ key_id, key_secret });
  return client;
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/** Checkout signature: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256(raw request body, WEBHOOK_SECRET). */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Normalises errors thrown by the Razorpay SDK ({ statusCode, error: { description } }). */
export function describeRazorpayError(err: any): { status: number; message: string } {
  const statusCode = Number(err?.statusCode) || 0;
  const description = err?.error?.description || err?.message || "Razorpay request failed";
  if (statusCode === 401) return { status: 401, message: "Payment gateway authentication failed." };
  return { status: 500, message: description };
}

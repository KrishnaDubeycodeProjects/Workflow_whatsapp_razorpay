// Razorpay rejects webhook URLs containing the word "razorpay", so the
// dashboard points here. Same handler as /api/razorpay/webhook.
//   URL: <NEXT_PUBLIC_APP_URL>/api/payments/webhook
export { POST } from "../../razorpay/webhook/route";

export const dynamic = "force-dynamic";

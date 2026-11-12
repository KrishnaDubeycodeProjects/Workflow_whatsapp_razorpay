import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import PDFDocument from "pdfkit";

export const dynamic = "force-dynamic";

function generatePdfBuffer(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const buffers: Buffer[] = [];

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const paidDate = new Date(data.paid_at).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    });

    // Outer Border
    doc.rect(20, 20, 555, 802).lineWidth(1.5).strokeColor("#d97706").stroke();
    doc.rect(24, 24, 547, 794).lineWidth(0.5).strokeColor("#fde68a").stroke();

    // Header Title
    doc.fontSize(22).fillColor("#78350f").font("Helvetica-Bold").text("GORAI EQUESTRIAN CENTRE", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#78716c").font("Helvetica").text("Away from the algorithm. Find your own rhythm.", { align: "center" });
    doc.text("Khajuriwadi, Gorai Village, Borivali West, Mumbai – 400092 | Contact: +91 93220 13233", { align: "center" });
    doc.moveDown(0.8);

    // Decorative Line
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1).strokeColor("#d97706").stroke();
    doc.moveDown(1);

    // Badge
    doc.fontSize(12).fillColor("#15803d").font("Helvetica-Bold").text("OFFICIAL PAYMENT RECEIPT & TAX INVOICE", { align: "center" });
    doc.moveDown(1.5);

    // Metadata Table
    const startY = doc.y;
    doc.fontSize(10).fillColor("#44403c").font("Helvetica-Bold");

    const fields = [
      ["Receipt No:", data.receipt_number || "GEC-OFFICIAL"],
      ["Date & Time:", paidDate],
      ["Rider Name:", data.full_name || "Valued Rider"],
      ["WhatsApp No:", data.whatsapp_number || "N/A"],
      ["Payment Gateway:", data.payment_gateway || "Razorpay/Card"],
      ["Gateway Ref ID:", data.gateway_payment_id || "Direct Verified"],
      ["Riding Experience:", data.service_title || "Equestrian Session"],
      ["Participants:", `${data.participants_count || 1} Rider(s)`],
      ["Status:", "PAID & CONFIRMED (100% SECURED)"],
    ];

    fields.forEach(([label, val]) => {
      doc.font("Helvetica-Bold").fillColor("#78716c").text(label, 60, doc.y, { continued: true, width: 160 });
      doc.font("Helvetica").fillColor("#1c1917").text(`   ${val}`, { align: "left" });
      doc.moveDown(0.6);
    });

    doc.moveDown(1);
    doc.moveTo(60, doc.y).lineTo(535, doc.y).lineWidth(0.5).strokeColor("#e7e5e4").stroke();
    doc.moveDown(1);

    // Total Box
    doc.rect(60, doc.y, 475, 45).fillColor("#fef3c7").fill();
    doc.fontSize(14).fillColor("#92400e").font("Helvetica-Bold").text(
      `TOTAL AMOUNT SETTLED:  INR ${Number(data.amount_inr || 0).toLocaleString("en-IN")}/-`,
      75,
      doc.y - 32,
      { align: "left" }
    );
    doc.moveDown(2);

    // Terms & Venue Guidelines
    doc.fontSize(9).fillColor("#78716c").font("Helvetica-Bold").text("IMPORTANT VENUE GUIDELINES:", 60);
    doc.moveDown(0.3);
    doc.font("Helvetica").fillColor("#a8a29e");
    doc.text("1. Please arrive at Gorai Equestrian Centre 15 minutes before your scheduled slot.");
    doc.text("2. Helmets and safety gear will be provided on-site. Comfortable trousers & closed footwear mandatory.");
    doc.text("3. Digital waiver agreement on file is legally binding under Mumbai Equestrian Safety Regulations.");
    doc.text("4. For reschedule or private coordination, call Salma at +91 93220 13233 or Anushka at +91 90219 39252.");
    doc.moveDown(1.5);

    doc.fontSize(9).fillColor("#b45309").font("Helvetica-Bold").text("THANK YOU FOR RIDING WITH GORAI EQUESTRIAN CENTRE!", { align: "center" });

    doc.end();
  });
}

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get("order_id") || req.nextUrl.searchParams.get("orderId");
    const receiptNum = req.nextUrl.searchParams.get("receipt");
    const format = req.nextUrl.searchParams.get("format");

    // Both identifiers are required (they always travel together in receipt links),
    // so a leaked order id alone never exposes a customer's receipt.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!orderId || !UUID_RE.test(orderId) || !receiptNum || receiptNum.length > 100) {
      return new NextResponse("A valid order ID and receipt number are required.", { status: 400 });
    }

    const res = await query(
      `SELECT p.receipt_number, p.amount_inr, p.paid_at, p.payment_gateway, p.gateway_payment_id,
              c.full_name, c.whatsapp_number,
              s.service_title, s.participants_count, s.unit_price_inr, s.total_amount_inr
       FROM payments p
       JOIN customers c ON c.customer_id = p.customer_id
       JOIN selected_services s ON s.order_id = p.order_id
       WHERE p.order_id = $1::uuid AND p.receipt_number = $2 AND p.payment_status = 'PAID'
       LIMIT 1;`,
      [orderId, receiptNum]
    );

    if (res.rowCount === 0) {
      return new NextResponse("Receipt not found for this order.", { status: 404 });
    }

    const data = res.rows[0];

    // If html format explicitly requested, render HTML
    if (format === "html") {
      const paidDate = new Date(data.paid_at).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      });

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt - ${data.receipt_number}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 40px 20px; }
    .receipt-card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); padding: 36px; border: 1px solid #e2e8f0; }
    .header { text-align: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 24px; margin-bottom: 24px; }
    .logo { width: 72px; height: 72px; object-fit: contain; margin-bottom: 12px; }
    .title { font-size: 22px; font-weight: 700; color: #0f172a; margin: 0; }
    .tagline { font-size: 13px; color: #64748b; margin-top: 4px; }
    .badge { display: inline-block; background: #dcfce7; color: #166534; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; margin-top: 12px; }
    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .details-table td { padding: 8px 0; font-size: 14px; }
    .details-table td.label { color: #64748b; width: 40%; }
    .details-table td.value { font-weight: 600; color: #0f172a; text-align: right; }
    .item-box { background: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px; }
    .item-title { font-size: 15px; font-weight: 700; color: #0f172a; }
    .total-row { display: flex; justify-content: space-between; border-top: 2px solid #0f172a; padding-top: 16px; font-size: 18px; font-weight: 800; color: #0f172a; }
  </style>
</head>
<body>
  <div class="receipt-card">
    <div class="header">
      <img src="https://files.catbox.moe/9hv6ct.png" alt="Gorai Equestrian Centre" class="logo">
      <h1 class="title">Gorai Equestrian Centre 🐎</h1>
      <div class="tagline">Khajuriwadi, Gorai, Mumbai, Maharashtra – 400092</div>
      <div class="badge">PAID & CONFIRMED</div>
    </div>
    <table class="details-table">
      <tr><td class="label">Receipt Number</td><td class="value">${data.receipt_number}</td></tr>
      <tr><td class="label">Date & Time</td><td class="value">${paidDate}</td></tr>
      <tr><td class="label">Rider Name</td><td class="value">${data.full_name}</td></tr>
      <tr><td class="label">WhatsApp Number</td><td class="value">${data.whatsapp_number}</td></tr>
      <tr><td class="label">Payment ID</td><td class="value">${data.gateway_payment_id || "Direct Gateway"}</td></tr>
    </table>
    <div class="item-box">
      <div class="item-title">${data.service_title}</div>
    </div>
    <div class="total-row">
      <span>Total Amount Paid:</span>
      <span>₹${Number(data.amount_inr || 0).toLocaleString("en-IN")}</span>
    </div>
  </div>
</body>
</html>`;
      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Default: Output genuine binary PDF
    const pdfBuffer = await generatePdfBuffer(data);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="GEC_Receipt_${data.receipt_number || "Official"}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("Receipt generation error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PRODUCT_LABELS, formatUGX } from "./api";

export interface ReceiptPayment {
  receipt_no: string | null; reference: string; gateway_reference: string | null; description: string; product: string;
  amount: number; currency: string; fulfilled_at: string | null; created_at: string; provider: string | null; msisdn: string | null; mode: string | null;
  refunded_amount?: number | null;
}

/** Simple A5 payment receipt generated in the browser from the confirmed payment record. */
export async function buildReceiptPdf(payment: ReceiptPayment, school: { name: string; id: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.13, 0.2); const muted = rgb(0.4, 0.43, 0.5); const accent = rgb(0.06, 0.27, 0.55);
  let y = 550;
  page.drawText("Skavio EduReports", { x: 32, y, size: 18, font: bold, color: accent });
  y -= 16; page.drawText("by Skavio Technologies · skavioedureports.dev", { x: 32, y, size: 9, font, color: muted });
  y -= 34; page.drawText("PAYMENT RECEIPT", { x: 32, y, size: 13, font: bold, color: ink });
  if (payment.mode === "TEST") page.drawText("TEST MODE — NOT A REAL PAYMENT", { x: 200, y, size: 9, font: bold, color: rgb(0.7, 0.1, 0.1) });
  y -= 26;
  const row = (label: string, value: string) => {
    page.drawText(label, { x: 32, y, size: 9, font, color: muted });
    page.drawText(value.slice(0, 60), { x: 150, y, size: 10, font, color: ink });
    y -= 20;
  };
  row("Receipt number", payment.receipt_no ?? "—");
  row("Date", new Date(payment.fulfilled_at ?? payment.created_at).toLocaleString("en-GB", { timeZone: "Africa/Kampala" }));
  row("School", school.name);
  row("School ID", school.id);
  row("Item", PRODUCT_LABELS[payment.product] ?? payment.product);
  row("Description", payment.description);
  row("Our reference", payment.reference);
  row("IntesaPay reference", payment.gateway_reference ?? "—");
  if (payment.provider) row("Paid with", payment.provider);
  if (payment.msisdn) row("Phone", payment.msisdn.replace(/(\+256\d{3})\d{3}(\d{3})/, "$1***$2"));
  y -= 8;
  page.drawLine({ start: { x: 32, y }, end: { x: 388, y }, thickness: 1, color: muted });
  y -= 26;
  page.drawText("Amount paid", { x: 32, y, size: 11, font: bold, color: ink });
  page.drawText(formatUGX(payment.amount), { x: 250, y, size: 14, font: bold, color: accent });
  if (payment.refunded_amount && payment.refunded_amount > 0) {
    y -= 20; page.drawText(`Refunded: ${formatUGX(payment.refunded_amount)}`, { x: 250, y, size: 10, font, color: muted });
  }
  page.drawText("Thank you for choosing Skavio EduReports.", { x: 32, y: 60, size: 9, font, color: muted });
  return doc.save();
}

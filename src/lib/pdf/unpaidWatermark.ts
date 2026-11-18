import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";

export const UNPAID_WATERMARK_TEXT = "SKAVIO EDUREPORTS – UNPAID PREVIEW";

/**
 * Stamps every page of a preview PDF with the unpaid-preview watermark. Only used for on-screen
 * previews; downloads and prints are locked until paid and always use the clean bytes.
 */
export async function watermarkUnpaidPdf(bytes: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const red = rgb(0.78, 0.1, 0.1);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.min(width, height) / 17;
    const textWidth = font.widthOfTextAtSize(UNPAID_WATERMARK_TEXT, size);
    const angle = Math.atan2(height, width);
    for (const f of [0.28, 0.5, 0.72]) {
      const cx = width * f, cy = height * f;
      page.drawText(UNPAID_WATERMARK_TEXT, {
        x: cx - (Math.cos(angle) * textWidth) / 2, y: cy - (Math.sin(angle) * textWidth) / 2,
        size, font, color: red, opacity: 0.2, rotate: degrees((angle * 180) / Math.PI),
      });
    }
    const banner = 9;
    const bw = font.widthOfTextAtSize(UNPAID_WATERMARK_TEXT, banner);
    page.drawRectangle({ x: 0, y: height - 16, width, height: 16, color: red, opacity: 0.85 });
    page.drawText(UNPAID_WATERMARK_TEXT, { x: (width - bw) / 2, y: height - 12, size: banner, font, color: rgb(1, 1, 1) });
  }
  return doc.save();
}

import { PDFDocument } from "pdf-lib";
import { inspectTemplate } from "@/lib/pdf/template/forms";

export const TEMPLATE_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024;

function imageDpi(bytes: Uint8Array, png: boolean): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (png) {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      if (offset + length + 12 > bytes.length) break;
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (type === "pHYs" && length === 9 && bytes[offset + 16] === 1) {
        const dpi = view.getUint32(offset + 8) * 0.0254;
        if (dpi >= 36 && dpi <= 1200) return dpi;
      }
      offset += length + 12;
    }
  } else {
    for (let offset = 2; offset + 4 < bytes.length;) {
      if (bytes[offset] !== 255 || bytes[offset + 1] === 218) break;
      const length = view.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if (bytes[offset + 1] === 224 && length >= 16 && String.fromCharCode(...bytes.slice(offset + 4, offset + 9)) === "JFIF\0") {
        const units = bytes[offset + 11];
        const density = view.getUint16(offset + 12);
        const dpi = units === 1 ? density : units === 2 ? density * 2.54 : 0;
        if (dpi >= 36 && dpi <= 1200) return dpi;
      }
      offset += length + 2;
    }
  }
  // Images without print-resolution metadata retain their aspect ratio at 96 dpi.
  return 96;
}

export async function convertTemplateFile(file: File) {
  if (!file.size) throw new Error("The selected file is empty.");
  if (file.size > MAX_TEMPLATE_BYTES) throw new Error("Choose a template smaller than 20 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "doc" || extension === "docx") throw new Error("Word conversion is not enabled for local-only uploads. In Word, export the document as PDF, then upload that PDF.");
  if (!["pdf", "jpg", "jpeg", "png"].includes(extension ?? "")) throw new Error("Choose a PDF, JPG, JPEG or PNG template.");
  const input = new Uint8Array(await file.arrayBuffer());
  let bytes = input;
  if (extension !== "pdf") {
    const png = extension === "png";
    const valid = png ? input.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => input[i] === value) : input[0] === 255 && input[1] === 216 && input[2] === 255;
    if (!valid) throw new Error("The image contents do not match its file type. Export a valid JPG or PNG and try again.");
    try {
      const doc = await PDFDocument.create();
      const image = png ? await doc.embedPng(input) : await doc.embedJpg(input);
      const dpi = imageDpi(input, png);
      const width = image.width * 72 / dpi;
      const height = image.height * 72 / dpi;
      const page = doc.addPage([width, height]);
      page.drawImage(image, { x: 0, y: 0, width, height });
      bytes = new Uint8Array(await doc.save());
    } catch {
      throw new Error("The image could not be converted. Export a valid, non-corrupted JPG or PNG and try again.");
    }
  }
  const info = await inspectTemplate(bytes);
  return { blob: new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }), info };
}
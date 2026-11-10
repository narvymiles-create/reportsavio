import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { convertTemplateFile } from "@/lib/templateConversion";
import { templateErrorMessage } from "@/lib/templateErrors";
import { File as NodeFile, Blob as NodeBlob } from "node:buffer";
import { vi } from "vitest";
vi.stubGlobal("Blob", NodeBlob);

const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
const file = (bytes: string | Uint8Array, name: string) => new NodeFile([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], name) as unknown as File;

describe("template upload conversion", () => {
  it("converts a PNG into a one-page fixed PDF at 96 dpi", async () => {
    const result = await convertTemplateFile(file(png, "scan.png"));
    const doc = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));
    expect(result.info).toMatchObject({ pageCount: 1, width: 0.75, height: 0.75, fieldNames: [] });
    expect(doc.getPageCount()).toBe(1);
  });
  it("keeps uploaded PDFs as PDFs", async () => {
    const doc = await PDFDocument.create(); doc.addPage([400, 500]);
    expect((await convertTemplateFile(file(await doc.save(), "scan.pdf"))).info).toMatchObject({ width: 400, height: 500 });
  });
  it("explains local-only Word handling", async () => {
    await expect(convertTemplateFile(file("word", "report.docx"))).rejects.toThrow("export the document as PDF");
  });
  it("shows messages from storage and database error objects", () => {
    expect(templateErrorMessage({ message: "The active education level changed." })).toBe("The active education level changed.");
    expect(templateErrorMessage({})).not.toContain("[object Object]");
  });
});

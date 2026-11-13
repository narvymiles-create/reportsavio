import { Blob as NodeBlob } from "node:buffer";
import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceReportDataSource, type DeviceReportStore } from "@/lib/reportDataSource";
import { generateCustomOutput } from "@/lib/pdf/customReport";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(() => vi.unstubAllGlobals());

describe("Device-backed production template rendering", () => {
  it.each(["primary", "nursery"] as const)("fills a %s template from device records and original PDF bytes without online reads", async level => {
    vi.stubGlobal("Blob", NodeBlob);
    const pdf = await PDFDocument.create(); const page = pdf.addPage([595, 842]);
    pdf.getForm().createTextField("learner.full_name").addToPage(page, { x: 30, y: 700, width: 300, height: 30 });
    const original = new Blob([new Uint8Array(await pdf.save()).buffer]);
    const data: Record<string, unknown[]> = {
      learners: [{ id: "learner", school_id: "school", full_name: "Saved Primary Learner", class_id: null }],
      nursery_learners: [{ id: "learner", school_id: "school", full_name: "Saved Nursery Learner", class_id: null }],
      terms: [{ id: "term", school_id: "school", name: "Term 1", year: 2026 }],
      school_info: [{ id: "info", school_id: "school", is_active: true, name: "Saved School" }],
    };
    const file = vi.fn(async () => original);
    const store = { rows: async (_school: string, table: string) => data[table] ?? [], file } as unknown as DeviceReportStore;
    const source = new DeviceReportDataSource("school", store);
    const blob = await generateCustomOutput({ id: "template", school_id: "school", level, name: "Saved template", file_path: "saved.pdf", is_active: false, page_count: 1, field_names: ["learner.full_name"], created_at: "" }, ["learner"], "term", undefined, 2026, source);
    const output = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(output.getPageCount()).toBe(1);
    expect(output.getForm().getTextField("learner.full_name").getText()).toBe(level === "primary" ? "Saved Primary Learner" : "Saved Nursery Learner");
    expect(file).toHaveBeenCalledWith("school", "report-templates", "saved.pdf");
  });
});
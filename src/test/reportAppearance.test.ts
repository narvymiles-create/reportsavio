import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { APPEARANCE_KEY, APPEARANCE_PRESETS, appearanceWarnings, contrast, parseAppearance } from "@/lib/reportAppearance";
import { DeviceReportDataSource, type DeviceReportStore } from "@/lib/reportDataSource";
import { loadPrimaryData, renderPrimaryBytes } from "@/lib/pdf/primaryReport";
import { loadNurseryData, renderNurseryReport } from "@/lib/pdf/nurseryReport";
import { Painter, loadFonts } from "@/lib/pdf/core";
import { AppearancePainter } from "@/lib/pdf/appearancePainter";
import { fillTemplate } from "@/lib/pdf/template/forms";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

describe("School-specific appearance rules", () => {
  it("preserves original defaults when no school configuration exists", () => { expect(parseAppearance(null)).toEqual({}); expect(appearanceWarnings({})).toEqual([]); });
  it("accepts only six-digit HEX colours for known roles", () => { expect(parseAppearance({ schoolName: "#ABCDEF", pageBackground: "red", other: "#111111" })).toEqual({ schoolName: "#abcdef" }); });
  it("rejects text hidden against its background", () => { expect(appearanceWarnings({ infoLabel: "#ffffff", infoBackground: "#ffffff" })).toContain("Field labels needs more contrast (minimum 4.5:1)."); expect(contrast("#000000", "#ffffff")).toBe(21); });
  it("rejects dark section backgrounds that can conceal signatures", () => { expect(appearanceWarnings({ commentBackground: "#000000", commentText: "#ffffff" }).some(w => w.includes("must stay light"))).toBe(true); });
  it.each(APPEARANCE_PRESETS)("$name meets readability requirements", theme => { expect(appearanceWarnings(theme.colours)).toEqual([]); expect(appearanceWarnings(theme.colours, "nursery")).toEqual([]); });
  it("uses the same semantic role for all draws without changing dimensions", async () => {
    const doc = await PDFDocument.create(); const page = doc.addPage(); const fonts = await loadFonts(doc);
    const text = vi.spyOn(Painter.prototype, "text");
    const rect = vi.spyOn(Painter.prototype, "rect");
    const painter = new AppearancePainter(page, fonts, { infoValue: "#14532d", infoBackground: "#ecfdf5" });
    painter.section("infoValue", "infoBackground", "infoBorder"); painter.text("Name", { x: 15, y: 25, size: 8 }); painter.rect({ x: 12, y: 24, w: 100, h: 17 });
    expect(text).toHaveBeenLastCalledWith("Name", { x: 15, y: 25, size: 8, color: "#14532d" });
    expect(rect.mock.calls.at(-1)?.[0]).toMatchObject({ x: 12, y: 24, w: 100, h: 17, fill: "#ecfdf5" });
    text.mockRestore(); rect.mockRestore();
  });
  it.each(["primary", "nursery"] as const)("loads and renders two schools' independent %s colours", async level => {
    const rows = (school: string, table: string) => {
      const shared = { school_id: school };
      if (table === "system_settings") return [{ ...shared, key: APPEARANCE_KEY, value: APPEARANCE_PRESETS[school === "a" ? 0 : 1].colours }];
      if (table === "learners" || table === "nursery_learners") return [{ ...shared, id: "learner", full_name: `Learner ${school}`, class_id: null }];
      if (table === "terms") return [{ ...shared, id: "term", name: "Term 1", year: 2026 }];
      if (table === "school_info") return [{ ...shared, is_active: true, name: `School ${school}` }];
      return [];
    };
    const store = { rows: async (school: string, table: string) => rows(school, table), file: async () => null } as unknown as DeviceReportStore;
    for (const school of ["a", "b"]) {
      const source = new DeviceReportDataSource(school, store);
      const data = level === "primary" ? await loadPrimaryData("learner", "term", source) : await loadNurseryData("learner", "term", source);
      expect(data.appearance.schoolName).toBe(school === "a" ? "#14532d" : "#7f1d1d");
      expect(data.learner.school_id).toBe(school);
      const bytes = "klass" in data ? await renderPrimaryBytes(data) : await (await renderNurseryReport(data)).save();
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
      await expect(source.read("system_settings", { eq: { school_id: school === "a" ? "b" : "a" } })).rejects.toThrow("current school");
    }
  });
  it("colours editable template text while preserving its font and original artwork", async () => {
    const doc = await PDFDocument.create(); const page = doc.addPage([595, 842]);
    const field = doc.getForm().createTextField("school.name"); field.addToPage(page, { x: 20, y: 700, width: 200, height: 30 });
    const output = await PDFDocument.load(await fillTemplate(await doc.save(), { "school.name": "Saved School" }, {}, { "school.name": "#14532d" }));
    const result = output.getForm().getTextField("school.name");
    expect(result.getText()).toBe("Saved School");
    expect(result.acroField.getDefaultAppearance()).toContain("0.0784313725490196 0.3254901960784314 0.17647058823529413 rg");
    expect(output.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
  });
});
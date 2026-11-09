import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import ReportTemplatesPage from "@/pages/ReportTemplatesPage";

const state = vi.hoisted(() => ({ level: "primary" as "primary" | "nursery", school: "school-one", eq: vi.fn(), rpc: vi.fn(), upload: vi.fn(), preview: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ schoolId: state.school, isAdmin: true, isSuperAdmin: false }) }));
vi.mock("@/hooks/useReportModule", () => ({ useReportModule: () => ({ module: state.level, loading: false }) }));
vi.mock("@/lib/pdf/defaultTemplatePreview", () => ({ defaultTemplatePreview: state.preview }));
vi.mock("@/components/PrimaryPdfViewer", () => ({ PrimaryPdfViewer: () => null }));
vi.mock("@/lib/pdf/template/forms", () => ({ inspectTemplate: async () => ({ width: 595, height: 842, pageCount: 1, fieldNames: [], unsupportedCount: 0 }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => { const chain = { select: () => chain, eq: (key: string, value: string) => { state.eq(key, value); return chain; }, order: async () => ({ data: [], error: null }) }; return chain; },
  rpc: state.rpc,
  storage: { from: () => ({ upload: state.upload, remove: async () => ({ error: null }) }) },
} }));

beforeEach(() => {
  cleanup(); state.level = "primary"; state.school = "school-one"; vi.clearAllMocks();
  state.upload.mockResolvedValue({ error: null }); state.rpc.mockResolvedValue({ error: null });
});

describe("Template upload scope", () => {
  it("queries only the current school and sidebar level, updating on a switch", async () => {
    const view = render(<ReportTemplatesPage />);
    await waitFor(() => expect(state.eq).toHaveBeenCalledWith("level", "primary"));
    expect(state.eq).toHaveBeenCalledWith("school_id", "school-one");
    state.level = "nursery"; view.rerender(<ReportTemplatesPage />);
    await waitFor(() => expect(state.eq).toHaveBeenCalledWith("level", "nursery"));
  });

  it.each(["primary", "nursery"] as const)("registers %s PDFs through backend level validation", async level => {
    state.level = level; render(<ReportTemplatesPage />);
    const file = new File(["PDF"], "template.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(3) });
    fireEvent.change(await screen.findByLabelText("Template name"), { target: { value: "School template" } });
    fireEvent.change(screen.getByLabelText("PDF template"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload PDF" }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("upload_report_template", expect.objectContaining({ _expected_level: level, _file_path: expect.stringMatching(new RegExp(`^school-one/${level}/`)) })));
  });

  it("clears an unfinished upload when switching levels", async () => {
    const view = render(<ReportTemplatesPage />);
    fireEvent.change(await screen.findByLabelText("Template name"), { target: { value: "Primary form" } });
    state.level = "nursery"; view.rerender(<ReportTemplatesPage />);
    expect(screen.getByLabelText("Template name")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Upload PDF" })).toBeDisabled();
  });
});
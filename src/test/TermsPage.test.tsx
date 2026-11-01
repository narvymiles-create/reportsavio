import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TermsPage from "@/pages/TermsPage";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), rpc: vi.fn(), toast: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ schoolId: "school-a", isAdmin: true, isSuperAdmin: false }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const result = { data: table === "terms" ? [{ id: "term-1", name: "Term 1", year: 2025, is_current: true }] : [
      { id: "year-2026", year: 2026, is_current: true }, { id: "year-2027", year: 2027, is_current: false },
    ], error: null };
    const chain = { select: () => chain, eq: () => chain, order: () => chain, then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve), insert: mocks.insert };
    return chain;
  }, rpc: mocks.rpc,
} }));

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.insert.mockResolvedValue({ error: null }); mocks.rpc.mockResolvedValue({ error: null }); });

describe("Independent term and academic year settings", () => {
  it("adds a term using current year 2026 independently of the existing term's 2025 year", async () => {
    render(<TermsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add term" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Add term" }));
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Term 2" } });
    fireEvent.submit(screen.getByLabelText("Name *").closest("form") as HTMLFormElement);
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ name: "Term 2", school_id: "school-a", year: 2026 })));
  });

  it("selects the independent year through the atomic year switch, not a term update", async () => {
    render(<TermsPage />);
    await screen.findByText("Current year: 2026");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Years" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("switch", { name: "Set 2027 as current year" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("set_current_academic_year", { _id: "year-2027" }));
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
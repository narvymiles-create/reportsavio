import { cleanup, act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ school: "", saved: "primary", write: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ schoolId: state.school }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { value: state.saved }, error: null }), upsert: state.write };
    return chain;
  },
} }));
import { ensureReportModuleSaved, useReportModule } from "@/hooks/useReportModule";

beforeEach(() => { cleanup(); state.saved = "primary"; state.write.mockReset(); });

it("waits for the sidebar selection to be saved before validating uploads", async () => {
  state.school = "race-school";
  let finish: (() => void) | undefined;
  state.write.mockImplementation(() => new Promise(resolve => { finish = () => { state.saved = "nursery"; resolve({ error: null }); }; }));
  const hook = renderHook(() => useReportModule());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  let selection: Promise<void>;
  act(() => { selection = hook.result.current.setModule("nursery"); });
  await waitFor(() => expect(state.write).toHaveBeenCalled());
  let validated = false;
  const check = ensureReportModuleSaved(state.school, "nursery").then(() => { validated = true; });
  expect(hook.result.current.loading).toBe(true);
  expect(validated).toBe(false);
  await act(async () => { finish?.(); await selection; await check; });
  expect(validated).toBe(true);
  expect(hook.result.current.loading).toBe(false);
});

it("reverts to the saved level when the sidebar write fails", async () => {
  state.school = "failure-school";
  state.write.mockResolvedValue({ error: { message: "permission denied" } });
  const hook = renderHook(() => useReportModule());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => { await hook.result.current.setModule("nursery"); });
  expect(hook.result.current.module).toBe("primary");
  await expect(ensureReportModuleSaved(state.school, "nursery")).rejects.toThrow("saved sidebar level differs");
});
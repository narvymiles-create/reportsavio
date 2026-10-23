import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrimaryPdfSession } from "@/lib/pdf/primaryPdfSession";

const revoke = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:primary"), revokeObjectURL: revoke });
  revoke.mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Primary PDF lifetime", () => {
  it("keeps the unchanged PDF URL alive while a native print tab is open after the preview closes", () => {
    const tab = { closed: false, close: vi.fn() };
    const openSpy = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const session = createPrimaryPdfSession(new Blob(["%PDF-test"], { type: "application/pdf" }));
    session.open();
    expect(openSpy).toHaveBeenCalledExactlyOnceWith("blob:primary", "_blank", "noopener");
    session.dispose();
    vi.advanceTimersByTime(10000);
    expect(revoke).not.toHaveBeenCalled();
    tab.closed = true;
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:primary");
  });

  it("waits until every bulk PDF tab closes before releasing its URL", () => {
    const first = { closed: false, location: { replace: vi.fn() } };
    const second = { closed: false, location: { replace: vi.fn() } };
    vi.spyOn(window, "open").mockReturnValueOnce(first as unknown as Window).mockReturnValueOnce(second as unknown as Window);
    const session = createPrimaryPdfSession(new Blob(["%PDF-test"]));
    session.open(); session.open(); session.dispose();
    first.closed = true; vi.advanceTimersByTime(1000);
    expect(revoke).not.toHaveBeenCalled();
    second.closed = true; vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:primary");
  });

  it("releases unused preview URLs exactly once", () => {
    const session = createPrimaryPdfSession(new Blob(["%PDF-test"]));
    session.dispose(); session.dispose();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:primary");
  });

  it("reports a blocked native PDF tab instead of silently printing nothing", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const session = createPrimaryPdfSession(new Blob(["%PDF-test"]));
    expect(() => session.open()).toThrow("PDF tab could not open");
    session.dispose();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:primary");
  });
});
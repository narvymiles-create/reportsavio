import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PrimaryPdfViewer } from "@/components/PrimaryPdfViewer";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), load: vi.fn(), open: vi.fn(), dispose: vi.fn(), toast: vi.fn(), navigate: vi.fn(), download: vi.fn(), session: vi.fn(), watermark: vi.fn(), entitled: true as boolean | null, callbacks: null as null | { onReady: (number: number) => void; onError: (message: string) => void } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/useSchoolEntitlement", () => ({ useSchoolEntitlement: () => ({ active: mocks.entitled, entitlement: null }) }));
vi.mock("@/lib/pdf/unpaidWatermark", () => ({ watermarkUnpaidPdf: mocks.watermark }));
vi.mock("@/lib/pdf/primaryOutput", () => ({ generatePrimaryOutput: mocks.generate }));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: mocks.load }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "/worker.mjs" }));
vi.mock("@/lib/pdf/primaryPdfSession", () => ({ createPrimaryPdfSession: (blob: Blob) => { mocks.session(blob); return { url: "blob:test", open: mocks.open, dispose: mocks.dispose }; } }));
vi.mock("@/components/PrimaryPdfPages", () => ({ PrimaryPdfPages: (props: typeof mocks.callbacks) => { mocks.callbacks = props; return null; } }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));
vi.mock("@/lib/pdf/core", () => ({ safeFilename: (value: string) => value, triggerBlobDownload: mocks.download }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.callbacks = null;
  mocks.entitled = true;
  mocks.watermark.mockResolvedValue(new Uint8Array(8));
  mocks.generate.mockResolvedValue({ type: "application/pdf", arrayBuffer: async () => new ArrayBuffer(8) });
  mocks.load.mockReturnValue({ promise: Promise.resolve({ numPages: 2 }), destroy: vi.fn() });
});
afterEach(cleanup);

it("enables printing only after all existing PDF pages have actually rendered, never automatically", async () => {
  render(<PrimaryPdfViewer learnerIds={["one", "two"]} termId="term" autoPrint />);
  const print = await screen.findByRole("button", { name: /Print \/ Save/ });
  expect(print).toBeDisabled();
  act(() => mocks.callbacks?.onReady(1));
  expect(print).toBeDisabled();
  act(() => mocks.callbacks?.onReady(2));
  expect(print).toBeEnabled();
  expect(mocks.open).not.toHaveBeenCalled();
  fireEvent.click(print);
  expect(mocks.open).toHaveBeenCalledTimes(1);
});

it("shows PDF rendering failures and offers retry instead of a blank frame", async () => {
  render(<PrimaryPdfViewer learnerIds={["one", "two"]} termId="term" />);
  await screen.findByRole("button", { name: /Print \/ Save/ });
  act(() => mocks.callbacks?.onError("worker unavailable"));
  expect(screen.getByRole("alert")).toHaveTextContent("worker unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Retry PDF" }));
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
});

it("ignores old generation results when the learner selection changes", async () => {
  let resolve: ((value: unknown) => void) | undefined;
  mocks.generate.mockReturnValueOnce(new Promise(value => { resolve = value; }));
  const view = render(<PrimaryPdfViewer learnerIds={["old"]} termId="term" />);
  view.rerender(<PrimaryPdfViewer learnerIds={["one", "two"]} termId="term" />);
  await screen.findByRole("button", { name: /Print \/ Save/ });
  await act(async () => resolve?.({ type: "application/pdf" }));
  expect(mocks.load).toHaveBeenCalledTimes(1);
});
it("unpaid previews are watermarked, keep no clean copy, and locked buttons never open, download or print", async () => {
  render(<PrimaryPdfViewer learnerIds={["one"]} termId="term" watermark />);
  const download = await screen.findByRole("button", { name: "Download PDF (locked)" });
  expect(mocks.watermark).toHaveBeenCalledTimes(1);
  expect(mocks.session).not.toHaveBeenCalled();
  fireEvent.click(download);
  fireEvent.click(screen.getByRole("button", { name: "Open PDF (locked)" }));
  fireEvent.click(screen.getByRole("button", { name: "Print (locked)" }));
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.navigate).toHaveBeenCalledWith("/pricing?reason=plan_required");
});

it("previews without a per-card answer are locked when the school has no active package", async () => {
  mocks.entitled = false;
  render(<PrimaryPdfViewer learnerIds={["one"]} termId="term" />);
  await screen.findByRole("button", { name: "Print (locked)" });
  expect(mocks.session).not.toHaveBeenCalled();
});

it("a locked action asks the database first and only then prepares the clean copy", async () => {
  const beforeOutput = vi.fn().mockResolvedValue(false);
  render(<PrimaryPdfViewer learnerIds={["one"]} termId="term" watermark beforeOutput={beforeOutput} />);
  fireEvent.click(await screen.findByRole("button", { name: "Download PDF (locked)" }));
  await waitFor(() => expect(beforeOutput).toHaveBeenCalledWith("download"));
  expect(mocks.session).not.toHaveBeenCalled();
  beforeOutput.mockResolvedValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Download PDF (locked)" }));
  await screen.findByRole("button", { name: "Download PDF" });
  expect(mocks.session).toHaveBeenCalledTimes(1);
  expect(mocks.download).not.toHaveBeenCalled();
});

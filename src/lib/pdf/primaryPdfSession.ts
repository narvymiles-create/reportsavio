/** Own a PDF URL until both the preview and every native PDF tab have closed. */
export function createPrimaryPdfSession(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const tabs = new Set<Window>();
  let disposed = false;
  let revoked = false;
  let poll: ReturnType<typeof setInterval> | undefined;
  const collect = () => {
    for (const tab of tabs) if (tab.closed) tabs.delete(tab);
    if (!tabs.size && poll !== undefined) { clearInterval(poll); poll = undefined; }
    if (disposed && !tabs.size && !revoked) {
      revoked = true;
      URL.revokeObjectURL(url);
    }
  };
  return {
    url,
    open() {
      if (disposed) throw new Error("This PDF preview has closed. Reopen the report to print it.");
      // Called synchronously by a click, never after generation or a timeout.
      // Open the blob URL directly: an about:blank tab whose opener was cleared
      // loses this origin and Chrome refuses to navigate it to the blob URL,
      // leaving a permanent about:blank. "_blank" already implies noopener.
      const tab = window.open(url, "_blank", "noopener");
      if (!tab) throw new Error("The PDF tab could not open. Allow this site's new tabs, then try again.");
      tabs.add(tab);
      if (poll === undefined) poll = setInterval(collect, 1000);
    },
    dispose() { disposed = true; collect(); },
  };
}
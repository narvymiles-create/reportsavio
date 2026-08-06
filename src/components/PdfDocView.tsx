import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared PDF surface.
 *
 * Every report card operation — live preview, print preview, print and
 * download — renders the very same pdf-lib output, so the pixels can never
 * drift between them.
 */
export function usePdfDoc(build: () => Promise<Blob>, deps: unknown[]) {
  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    setLoading(true);
    setError("");
    build()
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => {
      alive = false;
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const print = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return false;
    win.focus();
    win.print();
    return true;
  }, []);

  return { url, loading, error, iframeRef, print };
}

export function PdfFrame({
  url, title, className,
}: { url: string; title: string; className?: string } & Record<string, unknown>) {
  return <iframe title={title} src={url} className={className} />;
}

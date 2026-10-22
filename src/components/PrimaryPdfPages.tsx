import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

function PdfPage({ document, number, onReady, onError }: {
  document: PDFDocumentProxy; number: number; onReady: (number: number) => void; onError: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    (async () => {
      const page = await document.getPage(number);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Chrome could not create the PDF preview canvas.");
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      task = page.render({ canvasContext: context, viewport });
      await task.promise;
      if (!cancelled) onReady(number);
    })().catch((error: unknown) => {
      if (!cancelled) onError(error instanceof Error ? error.message : "Could not display the PDF page.");
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [document, number, onReady, onError]);
  return <canvas ref={canvasRef} role="img" aria-label={`Report card page ${number}`} className="block h-auto w-full" />;
}

/** Read the existing PDF; never rebuild its layout as HTML or use this canvas to print. */
export function PrimaryPdfPages({ document, onReady, onError }: {
  document: PDFDocumentProxy; onReady: (number: number) => void; onError: (message: string) => void;
}) {
  return <div className="space-y-4 p-3 sm:p-6">
    {Array.from({ length: document.numPages }, (_, index) => <div key={index} className="mx-auto w-full max-w-[794px] bg-background shadow-sm">
      <PdfPage document={document} number={index + 1} onReady={onReady} onError={onError} />
    </div>)}
  </div>;
}
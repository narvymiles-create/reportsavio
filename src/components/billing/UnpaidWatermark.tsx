import { ReactNode } from "react";
import { UNPAID_WATERMARK_TEXT } from "@/lib/pdf/unpaidWatermark";

/** On-screen unpaid-preview overlay for HTML report previews (Nursery). Never part of paid output. */
export function UnpaidWatermark({ active, children }: { active: boolean; children: ReactNode }) {
  if (!active) return <>{children}</>;
  return (
    <div className="relative" data-unpaid-preview>
      {children}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden select-none">
        <div className="sticky top-0 bg-destructive/90 py-1 text-center text-xs font-bold tracking-wide text-destructive-foreground">{UNPAID_WATERMARK_TEXT}</div>
        <div className="absolute inset-0 flex flex-col items-center justify-around">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="whitespace-nowrap text-3xl font-black tracking-widest text-destructive/20 md:text-5xl" style={{ transform: "rotate(-30deg)" }}>{UNPAID_WATERMARK_TEXT}</span>
          ))}
        </div>
      </div>
      <p role="status" className="sr-only">This is an unpaid preview. Download and printing unlock after payment.</p>
    </div>
  );
}

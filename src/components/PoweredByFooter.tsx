import skavioLogo from "@/assets/skavio-logo-transparent.png";

/**
 * Global "Powered by Skavio Technologies" footer.
 * Renders the small transparent Skavio logo (no background fill) and a label.
 * Visible on screen, in print, and inside any form/page in the system.
 */
export function PoweredByFooter({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground ${className}`}
      data-skavio-footer="true"
    >
      <img
        src={skavioLogo}
        alt="Skavio Technologies"
        width={20}
        height={20}
        loading="lazy"
        style={{ background: "transparent" }}
        className="h-5 w-5 object-contain"
      />
      <span>Powered by Skavio Technologies</span>
    </div>
  );
}

export default PoweredByFooter;

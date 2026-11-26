import skavioLogo from "@/assets/skavio-logo.png.asset.json";

/**
 * Global "Powered by Skavio Technologies" footer.
 * Renders the Skavio Technologies logo (transparent, no background fill)
 * alongside the "Powered by" label.
 * Visible on screen, in print, and inside any form/page in the system.
 */
export function PoweredByFooter({
  className = "",
  size = "md",
}: {
  className?: string;
  /** md = compact (28px), lg = larger (56px) */
  size?: "md" | "lg";
}) {
  const dim = size === "lg" ? 56 : 28;

  return (
    <div
      className={`flex items-center justify-center gap-2 py-1.5 text-xs text-muted-foreground ${className}`}
      data-skavio-footer="true"
    >
      <img
        src={skavioLogo.url}
        alt="Skavio Technologies"
        width={dim}
        height={dim}
        loading="lazy"
        style={{ background: "transparent" }}
        className="object-contain drop-shadow-sm"
      />
      <span className="font-medium">Powered by Skavio Technologies</span>
    </div>
  );
}

export default PoweredByFooter;

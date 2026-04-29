import skavioLogo from "@/assets/skavio-logo-transparent.png";

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
  /** md = default (40px), lg = larger (56px) */
  size?: "md" | "lg";
}) {
  const dim = size === "lg" ? 56 : 40;

  return (
    <div
      className={`flex items-center justify-center gap-3 py-4 text-sm text-muted-foreground ${className}`}
      data-skavio-footer="true"
    >
      <img
        src={skavioLogo}
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

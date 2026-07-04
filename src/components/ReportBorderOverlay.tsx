type ReportBorderOverlayProps = {
  borderStyle?: string;
  className?: string;
};

const STROKE = "#1a2a52";

export function ReportBorderOverlay({ borderStyle = "double", className }: ReportBorderOverlayProps) {
  const style = (borderStyle || "double").toLowerCase();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 210 297"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {style === "accent" && (
        <>
          <rect x="5" y="5" width="200" height="287" fill="none" stroke={STROKE} strokeWidth="0.5" />
          <rect x="5" y="20" width="4" height="257" fill={STROKE} />
          <rect x="201" y="20" width="4" height="257" fill={STROKE} />
          <line x1="9" y1="5" x2="201" y2="5" stroke={STROKE} strokeWidth="1.5" />
          <line x1="9" y1="292" x2="201" y2="292" stroke={STROKE} strokeWidth="1.5" />
        </>
      )}

      {style === "certificate" && (
        <>
          <rect x="4" y="4" width="202" height="289" fill="none" stroke={STROKE} strokeWidth="1.5" />
          <rect x="8" y="8" width="194" height="281" fill="none" stroke={STROKE} strokeWidth="0.5" />
          <path d="M4,4 Q15,15 4,26" fill="none" stroke={STROKE} strokeWidth="1" />
          <path d="M4,4 Q15,15 26,4" fill="none" stroke={STROKE} strokeWidth="1" />
          <path d="M206,4 Q195,15 206,26" fill="none" stroke={STROKE} strokeWidth="1" />
          <path d="M206,4 Q195,15 184,4" fill="none" stroke={STROKE} strokeWidth="1" />
          <path d="M4,293 Q15,282 4,271" fill="none" stroke={STROKE} strokeWidth="1" />
          <path d="M4,293 Q15,282 26,293" fill="none" stroke={STROKE} strokeWidth="1" />
          <path d="M206,293 Q195,282 206,271" fill="none" stroke={STROKE} strokeWidth="1" />
          <path d="M206,293 Q195,282 184,293" fill="none" stroke={STROKE} strokeWidth="1" />
          <path d="M95,4 Q105,12 115,4" fill="none" stroke={STROKE} strokeWidth="0.8" />
          <path d="M95,293 Q105,285 115,293" fill="none" stroke={STROKE} strokeWidth="0.8" />
        </>
      )}

      {style === "classic" && (
        <>
          <rect x="5" y="5" width="200" height="287" fill="none" stroke={STROKE} strokeWidth="1.5" />
          <circle cx="5" cy="5" r="2" fill={STROKE} />
          <circle cx="205" cy="5" r="2" fill={STROKE} />
          <circle cx="5" cy="292" r="2" fill={STROKE} />
          <circle cx="205" cy="292" r="2" fill={STROKE} />
          <circle cx="105" cy="5" r="1.5" fill={STROKE} />
          <circle cx="105" cy="292" r="1.5" fill={STROKE} />
          <circle cx="5" cy="148.5" r="1.5" fill={STROKE} />
          <circle cx="205" cy="148.5" r="1.5" fill={STROKE} />
        </>
      )}

      {style === "corner" && (
        <>
          <rect x="6" y="6" width="198" height="285" fill="none" stroke={STROKE} strokeWidth="0.8" />
          <path d="M6,30 L6,6 L30,6" fill="none" stroke={STROKE} strokeWidth="2.5" />
          <path d="M10,26 L10,10 L26,10" fill="none" stroke={STROKE} strokeWidth="1" />
          <path d="M180,6 L204,6 L204,30" fill="none" stroke={STROKE} strokeWidth="2.5" />
          <path d="M184,10 L200,10 L200,26" fill="none" stroke={STROKE} strokeWidth="1" />
          <path d="M6,267 L6,291 L30,291" fill="none" stroke={STROKE} strokeWidth="2.5" />
          <path d="M10,271 L10,287 L26,287" fill="none" stroke={STROKE} strokeWidth="1" />
          <path d="M180,291 L204,291 L204,267" fill="none" stroke={STROKE} strokeWidth="2.5" />
          <path d="M184,287 L200,287 L200,271" fill="none" stroke={STROKE} strokeWidth="1" />
        </>
      )}

      {style === "dotted" && (
        <>
          <rect x="4" y="4" width="202" height="289" fill="none" stroke={STROKE} strokeWidth="1.2" />
          <rect x="8" y="8" width="194" height="281" fill="none" stroke={STROKE} strokeWidth="0.8" strokeDasharray="2,2" />
        </>
      )}

      {! ["accent", "certificate", "classic", "corner", "dotted"].includes(style) && (
        <>
          <rect x="4" y="4" width="202" height="289" fill="none" stroke={STROKE} strokeWidth="1.2" />
          <rect x="7" y="7" width="196" height="283" fill="none" stroke={STROKE} strokeWidth="0.5" />
        </>
      )}
    </svg>
  );
}
import { cn } from "./cn";
import { EsgLiteMark } from "./EsgLiteLogo";
import { POWERED_BY_TEXT } from "./poweredByText";

/**
 * "Powered by PlanetPulse ESGLite" mark for sign-in, report covers and email
 * footers. `onDark` for brand-coloured surfaces (cover gradient, brand fills); uses --t-on-brand.
 */
export function PoweredBy({ onDark, size = "sm", className }: { onDark?: boolean; size?: "sm" | "md"; className?: string }) {
  return (
    <p
      aria-label={POWERED_BY_TEXT}
      className={cn(
        "inline-flex items-center gap-1.5 font-brand",
        size === "sm" ? "text-xs" : "text-sm",
        onDark ? "text-on-brand/80" : "text-muted",
        className,
      )}
    >
      <EsgLiteMark className={cn("h-3", size === "md" && "h-3.5", onDark ? "text-on-brand" : "text-brand")} />
      <span>
        Powered by <span className={cn("font-semibold", onDark ? "text-on-brand" : "text-ink")}>PlanetPulse ESGLite</span>
      </span>
    </p>
  );
}

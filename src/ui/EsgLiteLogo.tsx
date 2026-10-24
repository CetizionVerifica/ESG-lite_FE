import { type CSSProperties, useMemo } from "react";
import { PLANETPULSE, buildTheme, useTheme } from "../theme";
import { cn } from "./cn";

/**
 * The logo keeps PlanetPulse colours under any client theme (a Superadmin
 * previewing Glochem still sees a blue and teal ESGLite), so it scopes the few
 * tokens it reads to PlanetPulse.
 */
function usePlatformTokens(): CSSProperties {
  const { resolvedAppearance } = useTheme();
  return useMemo(() => {
    const t = buildTheme(PLANETPULSE, PLANETPULSE.defaultLook, resolvedAppearance);
    return {
      "--t-brand": t.brand,
      "--t-brand-text": t["brand-text"],
      "--t-accent": t.accent,
      "--t-ink": t.ink,
    } as CSSProperties;
  }, [resolvedAppearance]);
}

/**
 * The Reporting E: the E of ESG drawn as a spine and three bars that step
 * down 24 → 22 → 20, like emissions falling; the bottom bar is the accent.
 * Sized to the cap height of the text around it (0.745em in Plus Jakarta Sans).
 */
export function EsgLiteMark({ className }: { className?: string }) {
  const style = usePlatformTokens();
  return (
    <svg aria-hidden viewBox="0 0 24 32" style={style} className={cn("h-[0.745em] w-auto shrink-0", className)}>
      <g className="fill-current">
        <rect width="7.6" height="32" rx="1.3" />
        <rect width="24" height="7.6" rx="1.3" />
        <rect y="12.2" width="22" height="7.6" rx="1.3" />
      </g>
      <rect y="24.4" width="20" height="7.6" rx="1.3" className="fill-accent" />
    </svg>
  );
}

/**
 * ESGLite wordmark: the Reporting E, then "SG" and "Lite". `brand` colours it
 * for light surfaces; `inherit` takes the surrounding text colour (dark
 * chrome, brand covers). Font size sets the size.
 */
export function EsgLiteLogo({ tone = "brand", className }: { tone?: "brand" | "inherit"; className?: string }) {
  const style = usePlatformTokens();
  const brand = tone === "brand";
  return (
    <span
      role="img"
      aria-label="ESGLite"
      style={style}
      className={cn("inline-flex items-baseline font-brand leading-none font-extrabold tracking-[-0.035em] whitespace-nowrap", brand && "text-ink", className)}
    >
      <EsgLiteMark className={cn("mr-[0.035em]", brand && "text-brand")} />
      <span aria-hidden>SG</span>
      <span aria-hidden className={cn("font-medium tracking-[-0.02em]", brand ? "text-brand-text" : "opacity-85")}>
        Lite
      </span>
    </span>
  );
}

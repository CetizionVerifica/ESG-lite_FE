import type { CSSProperties } from "react";
import { useClientBrand } from "./useShellQueries";

/**
 * STAND-IN for F1's theme preview: paints the picked client's brand colours
 * on the page body (not the chrome, which stays PlanetPulse for staff).
 * Replace with buildTheme(brand, look, appearance) from src/theme.
 */
export function usePreviewStyle(clientId: number | null, enabled: boolean): CSSProperties | undefined {
  const brand = useClientBrand(enabled ? clientId : null);
  if (!enabled || !brand.data) return undefined;
  const { primary, accent, coverFrom, coverTo } = brand.data;
  return {
    "--t-brand": primary,
    "--t-accent": accent,
    "--t-cover-from": coverFrom,
    "--t-cover-to": coverTo,
  } as CSSProperties;
}

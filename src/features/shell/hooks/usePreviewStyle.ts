import { type CSSProperties, useMemo } from "react";
import { type BrandLike, type ResolvedAppearance, buildTheme, packFromBrand, toCssVars } from "../../../theme";
import { useClientBrand } from "./useShellQueries";

/**
 * Every --t-* token of the client's brand in its default look, minus the
 * chrome ones, so the top bar stays PlanetPulse for staff.
 */
export function previewVars(brand: BrandLike, appearance: ResolvedAppearance): Record<string, string> {
  const pack = packFromBrand(brand);
  const vars: Record<string, string> = toCssVars(buildTheme(pack, pack.defaultLook, appearance));
  for (const name of Object.keys(vars)) {
    if (name.startsWith("--t-chrome")) Reflect.deleteProperty(vars, name);
  }
  return vars;
}

/**
 * Superadmin theme preview: the picked client's tokens on the whole page,
 * background included (a Night-look brand needs its dark page under its light ink).
 */
export function usePreviewStyle(
  clientId: number | null,
  enabled: boolean,
  appearance: ResolvedAppearance,
): CSSProperties | undefined {
  const brand = useClientBrand(enabled ? clientId : null);
  const data = enabled ? brand.data : undefined;
  return useMemo(() => (data ? (previewVars(data, appearance) as CSSProperties) : undefined), [data, appearance]);
}

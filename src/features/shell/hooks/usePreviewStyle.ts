import { type CSSProperties, useMemo } from "react";
import { type ResolvedAppearance, buildTheme, packFromBrand, toCssVars } from "../../../theme";
import { useClientBrand } from "./useShellQueries";

/**
 * Superadmin theme preview: paints the picked client's full token set on the
 * page body in the brand's default look. The chrome stays PlanetPulse for staff.
 */
export function usePreviewStyle(
  clientId: number | null,
  enabled: boolean,
  appearance: ResolvedAppearance,
): CSSProperties | undefined {
  const brand = useClientBrand(enabled ? clientId : null);
  const data = enabled ? brand.data : undefined;
  return useMemo(() => {
    if (!data) return undefined;
    const pack = packFromBrand(data);
    return toCssVars(buildTheme(pack, pack.defaultLook, appearance)) as CSSProperties;
  }, [data, appearance]);
}

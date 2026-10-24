import { allowedColours, allowedFonts } from "../../../lib/studio/brandKit";
import type { FontId } from "../../../lib/studio/contracts";
import { useBrandKit } from "../brand-kit/api";

/**
 * DS-3 · the brand-controls hook for the editor's colour and font pickers
 * (DS-6 toolbar, DS-7 text): with `company.brand_controls` on (DS-13),
 * `colours` is the brand's colours only and `fonts` the brand pair only.
 * `colours` null = any colour.
 */
export function useBrandControls(): { on: boolean; colours: string[] | null; fonts: FontId[] } {
  const kit = useBrandKit();
  if (!kit.data) return { on: false, colours: null, fonts: allowedFonts({ brandControls: false, fonts: { heading: null, body: null } }) };
  return { on: kit.data.brandControls, colours: allowedColours(kit.data), fonts: allowedFonts(kit.data) };
}

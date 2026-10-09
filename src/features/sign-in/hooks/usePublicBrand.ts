import { useQuery } from "@tanstack/react-query";
import { PLANETPULSE, type ThemePack, packFromBrand } from "../../../theme";
import { getPublicBrand } from "../api";
import { isClientSlug } from "../logic";

/**
 * Theme pack for a signed-out page: the client's brand for a valid slug once
 * it loads, PlanetPulse otherwise (no slug, unknown slug, endpoint missing).
 */
export function usePublicBrand(slug: string | undefined): { pack: ThemePack; loading: boolean } {
  const valid = isClientSlug(slug);
  const query = useQuery({
    queryKey: ["brand", "public", slug],
    queryFn: () => getPublicBrand(slug as string),
    enabled: valid,
    staleTime: Infinity,
    retry: false,
  });
  // The public kit has no company id, so the pack is keyed by its slug.
  const pack = valid && query.data ? { ...packFromBrand({ ...query.data, companyId: 0 }), id: `client-${query.data.slug}` } : PLANETPULSE;
  return { pack, loading: valid && query.isPending };
}

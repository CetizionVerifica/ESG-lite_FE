import { useEffect } from "react";
import type { Option } from "../fields";
import { useContextParams } from "./useContextParams";

/**
 * A category the chosen sites don't have would still filter the page while the
 * chip can't show it: drop such ids from `?category=` once the options are known.
 * `ready` is false while the options are still loading; pass false too when
 * the sites have no categories, so an empty list never clears the choice.
 */
export function useDropStaleCategories(categories: Option<number>[], ready: boolean) {
  const [ctx, update] = useContextParams();
  const kept = ctx.categoryIds.filter((id) => categories.some((c) => c.value === id));
  const stale = ready && kept.length !== ctx.categoryIds.length;
  const keptKey = kept.join(",");
  useEffect(() => {
    if (stale) update({ categoryIds: keptKey ? keptKey.split(",").map(Number) : [] });
  }, [stale, keptKey, update]);
}

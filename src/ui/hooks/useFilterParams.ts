import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { readFilterParams, writeFilterParams, type FilterValues } from "../filterLogic";

/**
 * FilterBar values held in the URL (`?q=` plus one comma-separated param per filter key),
 * next to the page context from useContextParams.
 */
export function useFilterParams(keys: string[]) {
  const [params, setParams] = useSearchParams();
  const keyList = keys.join(",");
  const value = useMemo(() => readFilterParams(params, keyList.split(",").filter(Boolean)), [params, keyList]);
  const update = useCallback(
    (next: FilterValues) => setParams((p) => writeFilterParams(p, next, keyList.split(",").filter(Boolean)), { replace: true }),
    [setParams, keyList],
  );
  return [value, update] as const;
}

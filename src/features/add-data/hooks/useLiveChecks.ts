import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebounced } from "../../../ui";
import type { CheckRowBody } from "../../../lib/scope3/contracts";
import { checkRows } from "../../../services/reviewService";

/** Typing stops this long before the rows are checked. */
export const LIVE_CHECK_DEBOUNCE_MS = 400;

/**
 * S3-15 live checks: the review checks for `rows` as they'd be saved now,
 * 400 ms after typing stops. A newer check replaces a stale one (the old
 * query is dropped and its request aborted); the last answer stays on screen
 * while the next loads. Never blocks sending.
 */
export function useLiveChecks(rows: CheckRowBody[], enabled: boolean) {
  const now = JSON.stringify(rows);
  const key = useDebounced(now, LIVE_CHECK_DEBOUNCE_MS);
  const settled = useMemo(() => JSON.parse(key) as CheckRowBody[], [key]);
  const q = useQuery({
    queryKey: ["add-data", "live-checks", key],
    enabled: enabled && settled.length > 0,
    queryFn: ({ signal }) => checkRows(settled, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
  return {
    results: q.data,
    /** Typing not settled yet, or a check in flight. */
    checking: enabled && rows.length > 0 && (key !== now || q.isFetching),
    error: q.isError,
  };
}

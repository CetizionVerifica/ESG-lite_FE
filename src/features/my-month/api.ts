import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type MyMonthResponse, getMyMonth } from "../../services/myMonthService";

export const myMonthKey = (month: string | null) => ["my-month", month ?? "current"] as const;

/** B5 checklist for `month` (YYYY-MM), or the month currently due when null. */
export function useMyMonth(month: string | null) {
  return useQuery<MyMonthResponse>({
    queryKey: myMonthKey(month),
    queryFn: () => getMyMonth(month ?? undefined),
    placeholderData: keepPreviousData,
  });
}

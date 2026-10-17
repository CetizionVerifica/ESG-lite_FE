import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type MyMonthResponse, getMyMonth } from "../../services/myMonthService";
import { getEmissionsPaginated } from "../../services/emissionService";
import { markNothingThisMonth, submitEmissions, unmarkNothingThisMonth } from "../../services/reviewService";
import type { NothingThisMonthBody } from "../../lib/scope3/contracts";
import { invalidateEmissionQueries } from "../../lib/emissionQueries";

export const myMonthKey = (month: string | null) => ["my-month", month ?? "current"] as const;

/** B5 checklist for `month` (YYYY-MM), or the month currently due when null. */
export function useMyMonth(month: string | null) {
  return useQuery<MyMonthResponse>({
    queryKey: myMonthKey(month),
    queryFn: () => getMyMonth(month ?? undefined),
    placeholderData: keepPreviousData,
  });
}

/** Most drafts one list shows; more are rare (a month's typed rows). */
export const DRAFTS_LIMIT = 200;

/** S3-15: the signed-in contributor's drafts for `month` on `siteIds` (`GET /user/emissions?status=draft`). */
export function useMyDrafts(month: string | null, siteIds: number[], enabled: boolean) {
  const [year, m] = (month ?? "").split("-").map(Number);
  return useQuery({
    queryKey: ["my-month", "drafts", month, siteIds],
    enabled: enabled && !!month && siteIds.length > 0,
    queryFn: () => getEmissionsPaginated({ siteIds, year, month: m, status: "draft", page: 1, limit: DRAFTS_LIMIT, sort: "created_at", order: "asc" }),
  });
}

/** Submit drafts, then refresh My month, the drafts list and every emission list. */
export function useSubmitDrafts() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => submitEmissions(ids),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["my-month"] });
      void invalidateEmissionQueries(client);
    },
  });
}

/** Mark, or unmark (undo), "Nothing this month" for one category. */
export function useNothingThisMonth() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: ["my-month"] });
  return {
    mark: useMutation({ mutationFn: (body: NothingThisMonthBody) => markNothingThisMonth(body), onSettled: refresh }),
    unmark: useMutation({ mutationFn: (body: NothingThisMonthBody) => unmarkNothingThisMonth(body), onSettled: refresh }),
  };
}

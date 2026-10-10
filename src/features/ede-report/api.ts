import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type EdeReportResponse, getEdeReport } from "../../services/reportService";
import { getSites } from "../../services/siteService";
import type { SiteOption } from "../../ui";
import { type EdeQuery, normalize, requestPayload } from "./logic";

export const keys = {
  all: ["ede-report"] as const,
  report: (q: EdeQuery) => [...keys.all, requestPayload(q)] as const,
  adminSites: ["admin", "sites"] as const,
};

/** Every site (Superadmin): the page keeps the picked client's. */
export function useAdminSites(enabled: boolean) {
  return useQuery<SiteOption[]>({
    queryKey: keys.adminSites,
    queryFn: async () => ((await getSites()) as SiteOption[]) ?? [],
    enabled,
  });
}

/** The report plus the query that produced it, so labels never run ahead of the numbers. */
export type EdeReport = EdeReportResponse & { query: EdeQuery };

export function useEdeReport(q: EdeQuery | null) {
  return useQuery<EdeReport>({
    queryKey: q ? keys.report(q) : [...keys.all, null],
    queryFn: async () => ({
      ...normalize(await getEdeReport(requestPayload(q!))),
      query: q!,
    }),
    enabled: !!q && q.siteIds.length > 0,
    placeholderData: keepPreviousData,
  });
}

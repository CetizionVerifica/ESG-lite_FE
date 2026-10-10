import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getReportingCalendar } from "../../services/companyService";
import { type GhgReportDetailsResponse, type GhgReportTablesResponse, getGhgReportDetails, getGhgReportTables } from "../../services/ghgreportService";
import { getSites } from "../../services/siteService";
import { DEFAULT_FY_START_MONTH } from "../../ui";
import { type ReportQuery, type SiteOption, requestPayload } from "./logic";

export const keys = {
  all: ["ghg-report"] as const,
  tables: (q: ReportQuery) => [...keys.all, "tables", requestPayload(q)] as const,
  details: (q: ReportQuery) => [...keys.all, "details", requestPayload(q)] as const,
  calendar: ["reporting-calendar"] as const,
  adminSites: ["admin", "sites"] as const,
};

export { useDebounced } from "../../ui";

/** The company's FY start month (backend-owned); April until it arrives or if it can't be read. */
export function useFyStartMonth(): number {
  const q = useQuery({
    queryKey: keys.calendar,
    queryFn: getReportingCalendar,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const m = Number(q.data?.fiscalYearStartMonth);
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : DEFAULT_FY_START_MONTH;
}

/** Every site (Superadmin): the page keeps the picked client's. */
export function useAdminSites(enabled: boolean) {
  return useQuery<SiteOption[]>({
    queryKey: keys.adminSites,
    queryFn: async () => ((await getSites()) as SiteOption[]) ?? [],
    enabled,
  });
}

/** The tables plus the query that produced them, so labels never run ahead of the numbers. */
export type ReportTables = GhgReportTablesResponse & { query: ReportQuery };

/** Totals, Table 1 and the by-location tables for both years. */
export function useReportTables(q: ReportQuery | null) {
  return useQuery<ReportTables>({
    queryKey: q ? keys.tables(q) : [...keys.all, "tables", null],
    queryFn: async () => ({ ...(await getGhgReportTables(requestPayload(q!))), query: q! }),
    enabled: !!q && q.siteIds.length > 0,
    placeholderData: keepPreviousData,
  });
}

/** Category × site × fuel rows for both periods (the Scope tabs). */
export function useReportDetails(q: ReportQuery | null, enabled: boolean) {
  return useQuery<GhgReportDetailsResponse>({
    queryKey: q ? keys.details(q) : [...keys.all, "details", null],
    queryFn: () => getGhgReportDetails(requestPayload(q!)),
    enabled: enabled && !!q && q.siteIds.length > 0,
    placeholderData: keepPreviousData,
  });
}

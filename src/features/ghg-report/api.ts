import {
  type QueryClient,
  keepPreviousData,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import api from "../../api/axios";
import {
  type GhgReportDetailsResponse,
  type GhgReportTablesResponse,
  getGhgReportDetails,
  getGhgReportTables,
} from "../../services/ghgreportService";
import { getSites } from "../../services/siteService";
import { reportingCalendarKey } from "../../lib/fiscalYear";
import {
  type ReportQuery,
  type SiteOption,
  pdfParams,
  readBlobError,
  requestPayload,
} from "./logic";

export const keys = {
  all: ["ghg-report"] as const,
  tables: (q: ReportQuery) =>
    [...keys.all, "tables", requestPayload(q)] as const,
  details: (q: ReportQuery) =>
    [...keys.all, "details", requestPayload(q)] as const,
  calendar: reportingCalendarKey,
  adminSites: ["admin", "sites"] as const,
};

export { useDebounced } from "../../ui";

export { useFyStartMonth } from "../../lib/fiscalYear";

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
    queryFn: async () => ({
      ...(await getGhgReportTables(requestPayload(q!))),
      query: q!,
    }),
    enabled: !!q && q.siteIds.length > 0,
    placeholderData: keepPreviousData,
  });
}

/** Category × site × fuel rows for both periods (the Scope tabs). */
/** The detail rows for exactly `q`, from the cache when fresh (the XLSX export must never use another period's rows). */
export function fetchReportDetails(client: QueryClient, q: ReportQuery) {
  return client.fetchQuery<GhgReportDetailsResponse>({
    queryKey: keys.details(q),
    queryFn: () => getGhgReportDetails(requestPayload(q)),
  });
}

export function useReportDetails(q: ReportQuery | null, enabled: boolean) {
  return useQuery<GhgReportDetailsResponse>({
    queryKey: q ? keys.details(q) : [...keys.all, "details", null],
    queryFn: () => getGhgReportDetails(requestPayload(q!)),
    enabled: enabled && !!q && q.siteIds.length > 0,
    placeholderData: keepPreviousData,
  });
}

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some browsers start the download after click() returns; keep the URL alive a moment.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** The branded PDF (client theme, logo, narrative), fetched with the auth header and saved. */
export function useBrandedPdf() {
  return useMutation({
    mutationFn: async ({
      query,
      fileStem,
    }: {
      query: ReportQuery;
      fileStem: string;
    }) => {
      try {
        const res = await api.get<Blob>("/reports/ghg", {
          params: pdfParams(query),
          responseType: "blob",
        });
        save(res.data, `${fileStem}.pdf`);
      } catch (e) {
        throw await readBlobError(e);
      }
    },
  });
}

/** Every on-screen table in one workbook, a sheet each. */
export async function downloadWorkbook(
  sheets: { name: string; rows: (string | number)[][] }[],
  fileStem: string,
) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  for (const s of sheets)
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  const out = XLSX.write(book, { bookType: "xlsx", type: "array" });
  save(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${fileStem}.xlsx`,
  );
}

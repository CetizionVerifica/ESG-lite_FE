import { useMutation, useQuery } from "@tanstack/react-query";
import type { FrameworkCode } from "../../../lib/kpi/contracts";
import { useKpiCompanyId } from "../../../lib/kpi/switch";
import { downloadKpiReport, getKpiReport, getKpiValues } from "../../../services/kpiService";
import { fileNameFrom, saveBlob } from "../../../ui";
import { fallbackName } from "./logic";

export { kpiErrorMessage } from "../../../services/kpiService";

/** `GET /kpi/reports/:framework?year=&sites=&format=json`: the report model (approved values only). */
export function useReport(framework: FrameworkCode | null, year: number, sites: number[]) {
  const companyId = useKpiCompanyId();
  return useQuery({
    queryKey: ["kpi", "reports", companyId, framework, year, sites],
    queryFn: () => getKpiReport({ framework: framework as FrameworkCode, year, sites }, companyId),
    enabled: !!framework,
    placeholderData: (prev) => (prev?.framework === framework ? prev : undefined),
    staleTime: 30_000,
  });
}

/** The values behind a report row, for the record drawer: the row's KPIs for the year, kept to its value ids. */
export function useRowValues(kpiIds: number[], valueIds: number[], year: number) {
  const companyId = useKpiCompanyId();
  return useQuery({
    queryKey: ["kpi", "reports", "values", companyId, kpiIds, year],
    queryFn: async () => {
      const lists = await Promise.all(kpiIds.map((kpi) => getKpiValues({ kpi, from: `${year}-01-01`, to: `${year}-12-31` }, companyId)));
      const ids = new Set(valueIds);
      return lists.flat().filter((v) => ids.has(v.id));
    },
    enabled: kpiIds.length > 0 && valueIds.length > 0,
    staleTime: 60_000,
  });
}

/** Downloads the XLSX or the GRI PDF and saves it under the server's file name. */
export function useDownload() {
  const companyId = useKpiCompanyId();
  return useMutation({
    mutationFn: async ({ framework, year, sites, format }: { framework: FrameworkCode; year: number; sites: number[]; format: "xlsx" | "pdf" }) => {
      const { blob, fileName } = await downloadKpiReport({ framework, year, sites }, format, companyId);
      const name = fileNameFrom(fileName, fallbackName(framework, year, format));
      saveBlob(blob, name);
      return name;
    },
  });
}

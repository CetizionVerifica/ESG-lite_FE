import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type EmissionStatus, type PaginatedEmissions, getEmissionsPaginated } from "../../services/emissionService";
import { getUserColumnConfigsBySiteAndCategory } from "../../services/columnConfigService";
import { getDocumentsByEmission } from "../../services/documentService";
import type { LabelConfig } from "./logic";

export type EntriesQuery = {
  siteIds: number[];
  categoryId: number | null;
  status: EmissionStatus | null;
  year?: number;
  month?: number;
  search: string;
  sort: { key: string; order: "asc" | "desc" } | null;
  page: number;
  pageSize: number;
};

function fetchEntries(q: EntriesQuery): Promise<PaginatedEmissions> {
  return getEmissionsPaginated({
    siteIds: q.siteIds,
    categoryId: q.categoryId,
    status: q.status,
    year: q.year ?? null,
    month: q.month ?? null,
    search: q.search,
    sort: q.sort?.key ?? null,
    order: q.sort?.order ?? null,
    page: q.page,
    limit: q.pageSize,
  });
}

export function useEntries(q: EntriesQuery) {
  return useQuery({ queryKey: ["my-entries", q], queryFn: () => fetchEntries(q), placeholderData: keepPreviousData });
}

/** The site×category column config, for option labels. Fetched when a drawer opens, then cached. */
export function useLabelConfig(siteId: number | undefined, categoryId: number | undefined) {
  return useQuery({
    queryKey: ["column-config", siteId, categoryId],
    queryFn: async (): Promise<LabelConfig | null> => {
      const configs = (await getUserColumnConfigsBySiteAndCategory(siteId as number, categoryId as number)) as LabelConfig[] | null;
      return configs?.[0] ?? null;
    },
    enabled: siteId !== undefined && categoryId !== undefined,
    staleTime: 10 * 60_000,
  });
}

export function useEntryDocuments(entryId: number | null) {
  return useQuery({
    queryKey: ["emission-documents", entryId],
    queryFn: () => getDocumentsByEmission(entryId as number),
    enabled: entryId !== null,
  });
}

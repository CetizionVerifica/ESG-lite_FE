import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type EmissionStatus, type PaginatedEmissions, getEmissionsPaginated, updateEmission } from "../../services/emissionService";
import { getUserColumnConfigsBySiteAndCategory } from "../../services/columnConfigService";
import { deleteDocument, getDocumentsByEmission, uploadMultipleDocuments } from "../../services/documentService";
import { getEmissionBreakdown } from "../../services/emissionBreakdownService";
import { getUserEmissionFactorsBySiteAndCategory } from "../../services/emissionFactorService";
import { getUserUnitOptions, getUserUnitsBySiteAndCategory, type UnitData } from "../../services/unitService";
import type { UnitOptionsByActivity } from "../../lib/emissions";
import type { ColumnConfig, EmissionFactor } from "../../lib/emissions";
import type { EntryUpdate } from "./edit";
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

export function useEntries(q: EntriesQuery, enabled = true) {
  return useQuery({ queryKey: ["my-entries", q], queryFn: () => fetchEntries(q), placeholderData: keepPreviousData, enabled });
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

/** After evidence changes: the drawer's list, the table (its 📎 and data quality) and the entry's history. */
function evidenceChanged(client: ReturnType<typeof useQueryClient>, entryId: number) {
  void client.invalidateQueries({ queryKey: ["emission-documents", entryId] });
  void client.invalidateQueries({ queryKey: ["my-entries"] });
  void client.invalidateQueries({ queryKey: ["audit-logs", "emission", entryId] });
}

/** Attach files to an entry the User can still change (pending or rejected). */
export function useAddEvidence(entryId: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => uploadMultipleDocuments({ files, emission_id: entryId as number, document_type: "other" }),
    onSuccess: () => entryId !== null && evidenceChanged(client, entryId),
  });
}

/** Take a file off an entry the User can still change. */
export function useRemoveEvidence(entryId: number | null) {
  const client = useQueryClient();
  return useMutation({
    // data-loss-reviewed: removes one evidence file from the User's own pending or rejected entry, after an inline "Remove this file from the entry?" Keep / Remove file confirm that names the file; the entry itself stays
    mutationFn: (documentId: number) => deleteDocument(documentId),
    onSuccess: () => entryId !== null && evidenceChanged(client, entryId),
  });
}

/** What the edit form needs for one site × category. Factors come for every year, as the backend falls back to other years when saving. */
export type EditSetup = {
  config: ColumnConfig | null;
  factors: EmissionFactor[];
  units: string[];
  /** #183: the units each emission category may use; null when the API has no list (every unit is offered). */
  unitOptions: UnitOptionsByActivity | null;
  /** D6a: the site's FERA factors, for the WTT part a transport or travel row's total includes; empty when the site has no FERA category. */
  feraFactors: EmissionFactor[];
};

export function useEditSetup(siteId: number | undefined, categoryId: number | undefined, factorYear: number | null, feraCategoryId: number | null = null) {
  return useQuery({
    queryKey: ["entry-edit-setup", siteId, categoryId, feraCategoryId],
    enabled: siteId !== undefined && categoryId !== undefined && factorYear !== null,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<EditSetup> => {
      const site = siteId as number;
      const category = categoryId as number;
      const [configs, factors, units, unitOptions, feraFactors] = await Promise.all([
        getUserColumnConfigsBySiteAndCategory(site, category) as Promise<ColumnConfig[] | null>,
        getUserEmissionFactorsBySiteAndCategory(site, category) as Promise<EmissionFactor[]>,
        getUserUnitsBySiteAndCategory(site, category) as Promise<UnitData[]>,
        getUserUnitOptions(site, category).catch(() => null),
        // Not optional: the save adds a transport or travel row's WTT from them (D6a), so a failed
        // fetch shows the error and Try again rather than a total without it.
        feraCategoryId ? (getUserEmissionFactorsBySiteAndCategory(site, feraCategoryId) as Promise<EmissionFactor[]>) : Promise.resolve([] as EmissionFactor[]),
      ]);
      return { config: configs?.[0] ?? null, factors: factors ?? [], units: (units ?? []).map((u) => u.unit_name), unitOptions, feraFactors: feraFactors ?? [] };
    },
  });
}

/** Save an edited entry; the table, KPIs and the entry's history refresh after. */
export function useUpdateEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update, keepBoth }: { id: number; update: EntryUpdate; keepBoth?: boolean }) => updateEmission(id, update, { keepBoth }),
    // A refused save can mean someone else changed or approved the entry: refresh either way, so it opens as it is now.
    onSettled: (_data, _err, { id }) => {
      void client.invalidateQueries({ queryKey: ["my-entries"] });
      void client.invalidateQueries({ queryKey: ["audit-logs", "emission", id] });
    },
  });
}

/** Consumption and tCO₂e per emission category for one category, from the server. */
export function useBreakdown(q: Omit<EntriesQuery, "sort" | "page" | "pageSize" | "categoryId"> & { categoryId: number | null }, enabled: boolean) {
  return useQuery({
    queryKey: ["my-entries", "breakdown", q],
    queryFn: () => getEmissionBreakdown({ ...q, categoryId: q.categoryId as number }),
    enabled: enabled && q.categoryId !== null,
    placeholderData: keepPreviousData,
  });
}

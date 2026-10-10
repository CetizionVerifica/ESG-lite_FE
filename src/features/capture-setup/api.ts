import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnConfig, deleteColumnConfig, getColumnConfigs } from "../../services/columnConfigService";
import { createColumn, deleteColumn, getColumns, updateColumn } from "../../services/columnService";
import { getSites } from "../../services/siteService";
import type { ColumnDraft, FormConfig, LibraryColumn, Site } from "./logic";
import { toPayload } from "./logic";

export const keys = {
  all: ["capture-setup"] as const,
  configs: () => [...keys.all, "configs"] as const,
  columns: () => [...keys.all, "columns"] as const,
  sites: () => [...keys.all, "sites"] as const,
};

/** Lists arrive bare or wrapped (`{ sites: [...] }`); always hand back an array. */
function asList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const inner = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(inner) ? (inner as T[]) : [];
}

export const useForms = () =>
  useQuery<FormConfig[]>({ queryKey: keys.configs(), queryFn: async () => asList<FormConfig>(await getColumnConfigs(), "columnConfigs") });
export const useLibrary = () =>
  useQuery<LibraryColumn[]>({ queryKey: keys.columns(), queryFn: async () => asList<LibraryColumn>(await getColumns(), "columns") });
export const useSites = () =>
  useQuery<Site[]>({ queryKey: keys.sites(), queryFn: async () => asList<Site>(await getSites(), "sites"), staleTime: 5 * 60_000 });

export function useSaveColumn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft }: { id: number | null; draft: ColumnDraft }) =>
      id === null ? createColumn(toPayload(draft)) : updateColumn(id, toPayload(draft)),
    // Forms embed their columns, so both lists change.
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteColumn() {
  const qc = useQueryClient();
  return useMutation({
    // data-loss-reviewed: deletes one unused library column after a confirm dialog naming it; columns in use are blocked with a list of their forms
    mutationFn: (id: number) => deleteColumn(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.columns() }),
  });
}

export function useCreateForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { name: string; siteId: number; categoryId: number }) =>
      createColumnConfig({ config_name: d.name.trim(), site_id: d.siteId, category_id: d.categoryId }) as Promise<{
        columnConfig?: { pk_id?: number };
        pk_id?: number;
      }>,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteForm() {
  const qc = useQueryClient();
  return useMutation({
    // data-loss-reviewed: deletes one data-entry form after a destructive confirm naming the form, site and category; saved entries are kept
    mutationFn: (id: number) => deleteColumnConfig(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

/** The new form's id, whichever shape the create response has. */
export function createdId(res: { columnConfig?: { pk_id?: number }; pk_id?: number } | undefined): number | null {
  return res?.columnConfig?.pk_id ?? res?.pk_id ?? null;
}

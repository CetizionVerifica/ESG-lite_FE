// DS-4 · library calls (01-contracts §4 /templates, /layouts, /elements,
// /assets) and their TanStack Query hooks. A Superadmin passes the chosen
// client's company_id. Lists are cached a minute; the system library only
// changes with a deploy.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../../api/axios";
import type { DsErrorCode, ElementGroup, ElementTemplate, PageFormat, ReportKind, ReportLayout, ReportTemplate, ReportTemplateDetail, StudioAsset } from "../../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../../lib/studio/switch";

const params = (companyId: number | null, extra: Record<string, unknown> = {}) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== "") out[k] = v;
  return companyId ? { ...out, company_id: companyId } : out;
};

export interface TemplateFilters {
  kind: ReportKind;
  format?: PageFormat;
  q?: string;
}
export interface LayoutFilters {
  kind: ReportKind;
  format?: PageFormat;
  template?: string;
}
export interface ElementFilters {
  group?: ElementGroup;
  q?: string;
}

export async function getTemplates(f: TemplateFilters, companyId: number | null): Promise<ReportTemplate[]> {
  const { data } = await api.get<ReportTemplate[]>("/studio/templates", { params: params(companyId, { ...f }) });
  return data;
}
export async function getTemplate(id: number, companyId: number | null): Promise<ReportTemplateDetail> {
  const { data } = await api.get<ReportTemplateDetail>(`/studio/templates/${id}`, { params: params(companyId) });
  return data;
}
export async function getLayouts(f: LayoutFilters, companyId: number | null): Promise<ReportLayout[]> {
  const { data } = await api.get<ReportLayout[]>("/studio/layouts", { params: params(companyId, { ...f }) });
  return data;
}
export async function getElements(f: ElementFilters, companyId: number | null): Promise<ElementTemplate[]> {
  const { data } = await api.get<ElementTemplate[]>("/studio/elements", { params: params(companyId, { ...f }) });
  return data;
}
export async function getAssets(companyId: number | null): Promise<StudioAsset[]> {
  const { data } = await api.get<StudioAsset[]>("/studio/assets", { params: params(companyId) });
  return data;
}
export async function uploadAsset(file: File, folder: string | null, companyId: number | null): Promise<StudioAsset> {
  const form = new FormData();
  form.append("file", file);
  if (folder) form.append("folder", folder);
  if (companyId) form.append("company_id", String(companyId));
  const { data } = await api.post<StudioAsset>("/studio/assets", form, { params: params(companyId) });
  return data;
}
export async function patchAsset(id: string, body: { folder?: string | null; alt?: string }, companyId: number | null): Promise<StudioAsset> {
  const { data } = await api.patch<StudioAsset>(`/studio/assets/${id}`, companyId ? { ...body, company_id: companyId } : body, { params: params(companyId) });
  return data;
}
export async function deleteAsset(id: string, companyId: number | null): Promise<void> {
  // data-loss-reviewed: deletes an uploaded image; the Uploads drawer asks "Delete this image?" in a Modal first.
  await api.delete(`/studio/assets/${id}`, { params: params(companyId) });
}
export async function generateImage(prompt: string, folder: string | null, companyId: number | null): Promise<StudioAsset> {
  const body: Record<string, unknown> = { prompt };
  if (folder) body.folder = folder;
  if (companyId) body.company_id = companyId;
  const { data } = await api.post<StudioAsset>("/studio/assets/generate", body, { params: params(companyId) });
  return data;
}

export const libraryKeys = {
  templates: (companyId: number | null, f: TemplateFilters) => ["studio", "templates", companyId, f] as const,
  template: (companyId: number | null, id: number) => ["studio", "templates", companyId, "detail", id] as const,
  layouts: (companyId: number | null, f: LayoutFilters) => ["studio", "layouts", companyId, f] as const,
  elements: (companyId: number | null, f: ElementFilters) => ["studio", "elements", companyId, f] as const,
  assets: (companyId: number | null) => ["studio", "assets", companyId] as const,
};

export function useTemplates(f: TemplateFilters) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: libraryKeys.templates(companyId, f), queryFn: () => getTemplates(f, companyId), staleTime: 60_000, placeholderData: keepPreviousData });
}

/** One template with its doc (thumbnails and Apply). */
export function useTemplate(id: number | null) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: libraryKeys.template(companyId, id ?? 0), queryFn: () => getTemplate(id as number, companyId), enabled: id !== null, staleTime: 5 * 60_000 });
}

/** Fetches a template's detail through the cache (Apply). */
export function useFetchTemplate() {
  const qc = useQueryClient();
  const companyId = useStudioCompanyId();
  return (id: number) => qc.fetchQuery({ queryKey: libraryKeys.template(companyId, id), queryFn: () => getTemplate(id, companyId), staleTime: 5 * 60_000 });
}

export function useLayouts(f: LayoutFilters) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: libraryKeys.layouts(companyId, f), queryFn: () => getLayouts(f, companyId), staleTime: 60_000, placeholderData: keepPreviousData });
}

export function useElements(f: ElementFilters) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: libraryKeys.elements(companyId, f), queryFn: () => getElements(f, companyId), staleTime: 5 * 60_000, placeholderData: keepPreviousData });
}

export function useAssets() {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: libraryKeys.assets(companyId), queryFn: () => getAssets(companyId), staleTime: 30_000 });
}

function useAssetMutation<A, R>(fn: (arg: A, companyId: number | null) => Promise<R>) {
  const qc = useQueryClient();
  const companyId = useStudioCompanyId();
  return useMutation({
    mutationFn: (arg: A) => fn(arg, companyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: libraryKeys.assets(companyId) }),
  });
}

export const useUploadAsset = () => useAssetMutation(({ file, folder }: { file: File; folder: string | null }, c) => uploadAsset(file, folder, c));
export const usePatchAsset = () => useAssetMutation(({ id, ...body }: { id: string; folder?: string | null; alt?: string }, c) => patchAsset(id, body, c));
export const useDeleteAsset = () => useAssetMutation((id: string, c) => deleteAsset(id, c));
export const useGenerateImage = () => useAssetMutation(({ prompt, folder }: { prompt: string; folder: string | null }, c) => generateImage(prompt, folder, c));

const MESSAGES: Partial<Record<DsErrorCode, string>> = {
  DS_ASSET_TYPE: "Upload a JPG, PNG, WebP or SVG image. SVGs with scripts or links to other files aren't accepted.",
  DS_ASSET_TOO_LARGE: "Images can be up to 10 MB.",
  DS_AI_UNAVAILABLE: "Image generation isn't available right now.",
  DS_KIND_OFF: "Sustainability templates need KPI tracking.",
  DS_STUDIO_OFF: "Design Studio isn't turned on for your company.",
  DS_LAYOUT_NOT_FOUND: "That template is no longer available.",
  DS_DOC_NOT_FOUND: "That image was removed elsewhere. Reload the list.",
};

/** The message to show for a failed library call. */
export function libraryErrorMessage(e: unknown, fallback = "Something went wrong. Try again."): string {
  const data = (e as { response?: { data?: { code?: unknown; message?: unknown; details?: { reason?: unknown } } } })?.response?.data;
  const code = data?.code as DsErrorCode | undefined;
  if (code === "DS_VALIDATION" && data?.details?.reason === "ASSET_IN_USE") return "This image is used in a design. Remove it there first.";
  if (code && MESSAGES[code]) return MESSAGES[code] as string;
  return typeof data?.message === "string" && data.message ? data.message : fallback;
}

import api from "../api/axios";
import {
  type KpiCatalogue,
  type KpiDefinition,
  type KpiDisclosure,
  type KpiDisclosureMap,
  type KpiFramework,
  type KpiStatus,
  type LibraryDefinitionBody,
  isKpiErrorCode,
} from "../lib/kpi/contracts";
import { ERROR_MESSAGE } from "../lib/kpi/labels";

/**
 * KPI tracking (ESG-lite src/kpi, mounted at /kpi; docs/kpi/01-contracts.md §3).
 * A Superadmin passes the selected client as `company_id`. Modules add their
 * calls here as they land (KPI-n comment per block).
 */

const companyParams = (companyId: number | null | undefined) => (companyId ? { company_id: companyId } : undefined);
const asList = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);

// KPI-1
/** `GET /kpi/status`: answers even when the switch is off. A body without `enabled` (an older server) reads as unknown. */
export async function getKpiStatus(companyId?: number | null): Promise<Partial<KpiStatus>> {
  const { data } = await api.get("/kpi/status", { params: companyParams(companyId) });
  return data && typeof data === "object" ? (data as Partial<KpiStatus>) : {};
}

// KPI-2: the library (Superadmin) and the catalogue (any role of a company that is on)
export const getLibraryFrameworks = async () => asList<KpiFramework>((await api.get("/kpi/library/frameworks")).data);
export const getLibraryDefinitions = async () => asList<KpiDefinition>((await api.get("/kpi/library/definitions")).data);
export const getLibraryDisclosures = async (framework?: number | string) =>
  asList<KpiDisclosure>((await api.get("/kpi/library/disclosures", { params: framework ? { framework } : undefined })).data);
export const getLibraryMappings = async (framework?: number | string) =>
  asList<KpiDisclosureMap>((await api.get("/kpi/library/mappings", { params: framework ? { framework } : undefined })).data);
export const getKpiCatalogue = async (companyId?: number | null) =>
  (await api.get<KpiCatalogue>("/kpi/catalogue", { params: companyParams(companyId) })).data;
/** `PUT /kpi/library/definitions/:id` (Superadmin): any part of the definition; answers with the saved row. */
export const updateLibraryDefinition = async (id: number, patch: Partial<LibraryDefinitionBody>) =>
  (await api.put<KpiDefinition>(`/kpi/library/definitions/${id}`, patch)).data;

/** The server's message, or a plain one for a KPI error code; never the raw code. */
export function kpiErrorMessage(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { code?: unknown; message?: unknown } } })?.response?.data;
  if (isKpiErrorCode(data?.code)) return ERROR_MESSAGE[data.code];
  return typeof data?.message === "string" && data.message ? data.message : fallback;
}

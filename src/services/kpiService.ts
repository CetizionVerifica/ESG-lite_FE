import api from "../api/axios";
import { getCompanySites, getCompanyUsers } from "./companyAdminService";
import {
  type CustomKpiBody,
  type KpiAutoRefreshResult,
  type KpiCatalogue,
  type KpiDefinition,
  type KpiDisclosure,
  type KpiDisclosureMap,
  type KpiEvidenceOut,
  type KpiFramework,
  type KpiInviteResult,
  type KpiSetup,
  type KpiSetupPerson,
  type KpiSetupSite,
  type KpiStatus,
  type KpiValue,
  type KpiValueInput,
  type LibraryDefinitionBody,
  type MyKpiItem,
  type MyKpis,
  type PutKpiSetupBody,
  type PutKpiValuesResult,
  type SubmitKpiValuesResult,
  type SuggestMappingResult,
  MY_KPI_GROUPS,
  isKpiErrorCode,
} from "../lib/kpi/contracts";
import { ERROR_MESSAGE } from "../lib/kpi/labels";

/**
 * KPI tracking (ESG-lite src/kpi, mounted at /kpi; docs/kpi/01-contracts.md §3).
 * A Superadmin passes the selected client as `company_id`. Modules add their
 * calls here as they land (KPI-n comment per block).
 */

const companyParams = (companyId: number | null | undefined) => (companyId ? { company_id: companyId } : undefined);
/** The server wraps lists and rows by name (`{definitions: [...]}`, `{definition}`); a bare array or row is also read. */
const asList = <T>(data: unknown, key: string): T[] => {
  const inner = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>)[key] : data;
  return Array.isArray(inner) ? (inner as T[]) : [];
};
const asRow = <T>(data: unknown, key: string): T =>
  (data && typeof data === "object" && key in (data as object) ? (data as Record<string, unknown>)[key] : data) as T;

// KPI-1
/** `GET /kpi/status`: answers even when the switch is off. A body without `enabled` (an older server) reads as unknown. */
export async function getKpiStatus(companyId?: number | null): Promise<Partial<KpiStatus>> {
  const { data } = await api.get("/kpi/status", { params: companyParams(companyId) });
  return data && typeof data === "object" ? (data as Partial<KpiStatus>) : {};
}

// KPI-2: the library (Superadmin) and the catalogue (any role of a company that is on)
export const getLibraryFrameworks = async () => asList<KpiFramework>((await api.get("/kpi/library/frameworks")).data, "frameworks");
export const getLibraryDefinitions = async () => asList<KpiDefinition>((await api.get("/kpi/library/definitions")).data, "definitions");
export const getLibraryDisclosures = async (framework?: number | string) =>
  asList<KpiDisclosure>((await api.get("/kpi/library/disclosures", { params: framework ? { framework } : undefined })).data, "disclosures");
export const getLibraryMappings = async (framework?: number | string) =>
  asList<KpiDisclosureMap>((await api.get("/kpi/library/mappings", { params: framework ? { framework } : undefined })).data, "mappings");
export const getKpiCatalogue = async (companyId?: number | null) =>
  (await api.get<KpiCatalogue>("/kpi/catalogue", { params: companyParams(companyId) })).data;
/** `PUT /kpi/library/definitions/:id` (Superadmin): any part of the definition; answers with the saved row. */
export const updateLibraryDefinition = async (id: number, patch: Partial<LibraryDefinitionBody>) =>
  asRow<KpiDefinition>((await api.put(`/kpi/library/definitions/${id}`, patch)).data, "definition");

// KPI-3: company setup (Admin writes; any role of the company reads)
/** `GET /kpi/setup`: the composite as it is, or wrapped as `{setup}`. Missing parts read as empty. */
export async function getKpiSetup(companyId?: number | null): Promise<KpiSetup> {
  return readSetup((await api.get("/kpi/setup", { params: companyParams(companyId) })).data);
}
/** `PUT /kpi/setup`: any part; answers with the whole setup. */
export async function putKpiSetup(body: PutKpiSetupBody, companyId?: number | null): Promise<KpiSetup> {
  return readSetup((await api.put("/kpi/setup", body, { params: companyParams(companyId) })).data);
}
export function readSetup(data: unknown): KpiSetup {
  const raw = asRow<Partial<KpiSetup> | null>(data, "setup") ?? {};
  return {
    ...raw,
    settings: raw.settings ?? ({ company_id: companyIdOf(raw), year_type: "CY", first_year: new Date().getFullYear(), due_day: 15, setup_completed_at: null } as KpiSetup["settings"]),
    frameworks: raw.frameworks ?? [],
    material_topics: raw.material_topics ?? [],
    kpis: raw.kpis ?? [],
    assignments: raw.assignments ?? [],
  };
}
const companyIdOf = (raw: Partial<KpiSetup>) => raw.settings?.company_id ?? 0;
/** The ids in `recommended`, whether the server lists ids or rows. Null when it doesn't send the list. */
export function recommendedIds(setup: KpiSetup): Set<number> | null {
  if (!Array.isArray(setup.recommended)) return null;
  return new Set(setup.recommended.map((r) => (typeof r === "number" ? r : Number(r?.kpi_definition_id))).filter((n) => Number.isInteger(n) && n > 0));
}
/** `POST /kpi/setup/custom-kpis` (Admin): answers `{definition}` (a bare row is read too). */
export const createCustomKpi = async (body: CustomKpiBody, companyId?: number | null) =>
  asRow<KpiDefinition>((await api.post("/kpi/setup/custom-kpis", body, { params: companyParams(companyId) })).data, "definition");
/** Assumed endpoint: `POST /kpi/setup/invite` sends `kpi_assigned` notifications to every owner. */
export const inviteKpiOwners = async (companyId?: number | null): Promise<KpiInviteResult> => {
  const data = (await api.post("/kpi/setup/invite", {}, { params: companyParams(companyId) })).data as Partial<KpiInviteResult> | null;
  return { notified: Number(data?.notified ?? 0) };
};
/** `POST /kpi/ai/suggest-mapping` (KPI-12): suggestions only, the Admin picks. */
export const suggestKpiMapping = async (body: { name: string; question?: string; unit?: string | null }, companyId?: number | null) =>
  asList<SuggestMappingResult["suggestions"][number]>((await api.post("/kpi/ai/suggest-mapping", body, { params: companyParams(companyId) })).data, "suggestions");

type PersonRow = { user_id: number; name?: string | null; last_name?: string | null; email?: string; role?: string; site?: { site_id: number } | null; sites?: { site_id: number }[] | null };
const personName = (u: PersonRow) => [u.name, u.last_name].filter(Boolean).join(" ").trim() || u.email || `User ${u.user_id}`;
/** Sites and people for the owners step: from `GET /kpi/setup` when it sends them, else the Admin's company lists. */
export async function getSetupPeople(setup: KpiSetup): Promise<{ sites: KpiSetupSite[]; people: KpiSetupPerson[] }> {
  if (Array.isArray(setup.sites) && Array.isArray(setup.people)) return { sites: setup.sites, people: setup.people };
  const [sites, users] = await Promise.all([getCompanySites(), getCompanyUsers()]);
  const siteRows = (Array.isArray(sites) ? sites : asList<KpiSetupSite>(sites, "sites")).map((x: KpiSetupSite) => ({ site_id: x.site_id, name: x.name }));
  const people = (Array.isArray(users) ? users : asList<PersonRow>(users, "users")).map((u: PersonRow) => ({
    user_id: u.user_id,
    name: personName(u),
    role: u.role ?? "User",
    site_ids: [...new Set([...(u.sites ?? []), ...(u.site ? [u.site] : [])].map((x) => x.site_id))],
  }));
  return { sites: siteRows, people };
}

// KPI-7: what the caller owes
/**
 * `GET /kpi/my?period=YYYY-MM&site=`. Items may come flat (the KPI-0 mock
 * shape) or nested as the KPI-7 spec words it (`{kpi, site, period, value,
 * last_value}`); both read into `MyKpiItem`.
 */
export async function getMyKpis(period: string, siteId?: number | null, companyId?: number | null): Promise<MyKpis> {
  const params = { period, ...(siteId ? { site: siteId } : {}), ...companyParams(companyId) };
  return readMyKpis((await api.get("/kpi/my", { params })).data, period);
}

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : {});
const pick = <T>(...vals: unknown[]): T => vals.find((v) => v !== undefined) as T;

export function readMyKpis(data: unknown, period: string): MyKpis {
  const root = obj(asRow<unknown>(data, "my"));
  const items = asList<Loose>(root, "items").map(readMyItem);
  const counts = { due: 0, sent_back: 0, done: 0, total: items.length };
  for (const i of items) counts[i.group] += 1;
  return { period: typeof root.period === "string" ? root.period : period, items, counts };
}

function readMyItem(raw: Loose): MyKpiItem {
  const kpi = obj(raw.kpi);
  const site = obj(raw.site);
  const per = obj(raw.period);
  const value = (raw.value ?? null) as KpiValue | null;
  const group = MY_KPI_GROUPS.includes(raw.group as MyKpiItem["group"]) ? (raw.group as MyKpiItem["group"]) : groupOf(value);
  return {
    ...(raw as unknown as MyKpiItem),
    kpi_definition_id: Number(pick(raw.kpi_definition_id, kpi.id, kpi.kpi_definition_id)),
    code: pick(raw.code, kpi.code, ""),
    name: pick(raw.name, kpi.name, ""),
    question: pick(raw.question, kpi.question, ""),
    help: pick(raw.help, kpi.help, null),
    topic: pick(raw.topic, kpi.topic, "governance"),
    source: pick(raw.source, kpi.source, "manual"),
    value_type: pick(raw.value_type, kpi.value_type, "number"),
    canonical_unit: pick(raw.canonical_unit, kpi.canonical_unit, kpi.unit, null),
    allowed_units: pick(raw.allowed_units, kpi.allowed_units, []),
    level: pick(raw.level, kpi.level, undefined),
    decimals: pick(raw.decimals, kpi.decimals, undefined),
    breakdowns: pick(raw.breakdowns, kpi.breakdowns, null),
    needs_evidence: pick(raw.needs_evidence, kpi.needs_evidence, false),
    auto_source: pick(raw.auto_source, kpi.auto_source, null),
    formula: pick(raw.formula, kpi.formula, null),
    used_in: pick(raw.used_in, kpi.used_in, kpi.frameworks, []),
    site_id: pick(raw.site_id, typeof raw.site === "number" ? raw.site : site.site_id, site.id, null),
    site_name: pick(raw.site_name, site.name, null),
    period_start: pick(raw.period_start, per.start, per.period_start, ""),
    period_end: pick(raw.period_end, per.end, per.period_end, ""),
    frequency: pick(raw.frequency, per.frequency, kpi.frequency, kpi.default_frequency, "monthly"),
    due_date: pick(raw.due_date, per.due_date, per.due, ""),
    year_type: pick(raw.year_type, per.year_type, undefined),
    group,
    value,
    last_value: (raw.last_value ?? null) as MyKpiItem["last_value"],
  };
}

/** Nothing yet or a draft = due; rejected = sent back; pending or approved = done. */
export function groupOf(value: Pick<KpiValue, "status"> | null): MyKpiItem["group"] {
  if (!value || value.status === "draft") return "due";
  return value.status === "rejected" ? "sent_back" : "done";
}

// KPI-4 / KPI-7: values
export const getKpiValues = async (params: Record<string, string | number | undefined>, companyId?: number | null) =>
  asList<KpiValue>((await api.get("/kpi/values", { params: { ...params, ...companyParams(companyId) } })).data, "values");
/** `PUT /kpi/values {items}`: HTTP 200 with a result per item, in the order sent. */
export async function saveKpiValues(items: KpiValueInput[], companyId?: number | null): Promise<PutKpiValuesResult> {
  const data = obj((await api.put("/kpi/values", { items }, { params: companyParams(companyId) })).data);
  return { saved: Number(data.saved ?? 0), results: asList(data, "results") };
}
export async function submitKpiValues(ids: number[], companyId?: number | null): Promise<SubmitKpiValuesResult> {
  const data = obj((await api.post("/kpi/values/submit", { ids }, { params: companyParams(companyId) })).data);
  return { submitted: asList<number>(data, "submitted"), refused: asList(data, "refused") };
}
/** Multipart field `file`; answers 201 `{evidence}`. */
export async function uploadKpiEvidence(valueId: number, file: File, companyId?: number | null): Promise<KpiEvidenceOut> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post(`/kpi/values/${valueId}/evidence`, form, { params: companyParams(companyId), headers: { "Content-Type": "multipart/form-data" } });
  return asRow<KpiEvidenceOut>(res.data, "evidence");
}
export const removeKpiEvidence = async (valueId: number, evidenceId: number, companyId?: number | null) =>
  (await api.delete(`/kpi/values/${valueId}/evidence/${evidenceId}`, { params: companyParams(companyId) })).data as { removed: number };

// KPI-5: auto values
export async function refreshAutoKpis(year: number, companyId?: number | null): Promise<KpiAutoRefreshResult> {
  const data = obj((await api.post("/kpi/auto/refresh", {}, { params: { year, ...companyParams(companyId) } })).data);
  return { year: Number(data.year ?? year), refreshed: Number(data.refreshed ?? 0), values: asList<KpiValue>(data, "values") };
}

/** The server's message, or a plain one for a KPI error code; never the raw code. */
export function kpiErrorMessage(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { code?: unknown; message?: unknown } } })?.response?.data;
  if (isKpiErrorCode(data?.code)) return ERROR_MESSAGE[data.code];
  return typeof data?.message === "string" && data.message ? data.message : fallback;
}

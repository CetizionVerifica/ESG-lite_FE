import api from "../api/axios";
import { getCompanySites, getCompanyUsers } from "./companyAdminService";
import {
  type CustomKpiBody,
  FRAMEWORK_CODES,
  type FrameworkCode,
  type KpiAutoRefreshResult,
  type KpiCoverage,
  type KpiDashboard,
  type KpiDashboardCard,
  type KpiFrameworkReport,
  type KpiGap,
  type KpiLockBody,
  type KpiPeriodLock,
  type KpiPeriodLockStatus,
  type KpiRemindResult,
  type KpiReportOmission,
  type KpiReportRow,
  type KpiTargetWithProgress,
  type KpiPersonTopics,
  type KpiOverview,
  type KpiTemplateCommitResult,
  type KpiTemplatePlan,
  type KpiTemplateRow,
  type KpiTopic,
  type KpiTopicMove,
  KPI_TOPICS,
  type PutKpiPersonTopicsBody,
  type PutKpiPersonTopicsResult,
  type KpiUnlockBody,
  type PutKpiTargetBody,
  type ReportFormat,
  type ReviewKpiValuesResult,
  TARGET_STATUSES,
  type TargetStatus,
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
  MY_KPI_GROUPS,
  isKpiErrorCode,
} from "../lib/kpi/contracts";
import { ERROR_MESSAGE } from "../lib/kpi/labels";
import { type ValueSuggestions, readValueSuggestions } from "../lib/kpi/ai";

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

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : {});
const pick = <T>(...vals: unknown[]): T => vals.find((v) => v !== undefined) as T;

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
/** The AI calls can take about a minute (wave D): longer than the app's default. */
const AI_TIMEOUT_MS = 90_000;
/** `POST /kpi/ai/suggest-mapping` (KPI-12): suggestions only, the Admin picks. The raw answer; `readMappingSuggestions` reads it. */
export const suggestKpiMapping = async (body: { name: string; question?: string; unit?: string | null; topic?: string | null }, companyId?: number | null): Promise<unknown> =>
  (await api.post("/kpi/ai/suggest-mapping", body, { params: companyParams(companyId), timeout: AI_TIMEOUT_MS })).data as unknown;
/**
 * `POST /kpi/ai/suggest-values` (KPI-12): multipart `file` with `site_id` and
 * `period`, or JSON `{document_id, site_id, period}`. Suggestions only.
 */
export async function suggestKpiValues(input: { file?: File; documentId?: number; siteId?: number | null; period: string }, companyId?: number | null): Promise<ValueSuggestions> {
  const config = { params: companyParams(companyId), timeout: AI_TIMEOUT_MS };
  let data: unknown;
  if (input.file) {
    const form = new FormData();
    form.append("file", input.file);
    form.append("period", input.period);
    if (input.siteId) form.append("site_id", String(input.siteId));
    data = (await api.post("/kpi/ai/suggest-values", form, config)).data;
  } else {
    data = (await api.post("/kpi/ai/suggest-values", { document_id: input.documentId, period: input.period, ...(input.siteId ? { site_id: input.siteId } : {}) }, config)).data;
  }
  return readValueSuggestions(data, input.file?.name ?? null);
}
/** True for a failure that means "AI is down" (no answer, a timeout, a 5xx): shown as the calm note, not an error. */
export function isAiDown(e: unknown): boolean {
  const err = e as { response?: { status?: number }; code?: string } | null;
  return !err?.response || (err.response.status ?? 0) >= 500 || err.code === "ECONNABORTED";
}

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

// D17: a person's KPI topics (company users drawer; Admin, Superadmin, a Manager for their sites)
const topicList = (v: unknown): KpiTopic[] => (Array.isArray(v) ? v.filter((t): t is KpiTopic => (KPI_TOPICS as readonly string[]).includes(t as string)) : []);
/** `GET /kpi/people/:user_id/topics` → `{topics, by_site}` (also read when wrapped as `{person_topics}` or `{topics: {…}}`). */
export async function getPersonTopics(userId: number, companyId?: number | null): Promise<KpiPersonTopics> {
  const data = obj(asRow<unknown>((await api.get(`/kpi/people/${userId}/topics`, { params: companyParams(companyId) })).data, "person_topics"));
  const bySite = asList<Loose>(data, "by_site").map((r) => ({ site_id: (r.site_id ?? null) as number | null, site_name: (r.site_name ?? null) as string | null, topics: topicList(r.topics) }));
  const topics = topicList(data.topics);
  return { topics: topics.length ? topics : KPI_TOPICS.filter((t) => bySite.some((b) => b.topics.includes(t))), by_site: bySite };
}
/** `PUT /kpi/people/:user_id/topics {company_id?, topics, site_ids?}` → `{topics, site_ids, moved}`; `moved` is read as a list, missing = none. */
export async function putPersonTopics(userId: number, body: PutKpiPersonTopicsBody, companyId?: number | null): Promise<PutKpiPersonTopicsResult> {
  const sent = companyId ? { company_id: companyId, ...body } : body;
  const data = obj(asRow<unknown>((await api.put(`/kpi/people/${userId}/topics`, sent, { params: companyParams(companyId) })).data, "person_topics"));
  const moved = asList<Loose>(data, "moved").map(
    (m): KpiTopicMove => ({
      site_id: (m.site_id ?? null) as number | null,
      site_name: (m.site_name ?? null) as string | null,
      topic: m.topic as KpiTopic,
      from_user_id: (m.from_user_id ?? null) as number | null,
      from_name: (m.from_name ?? null) as string | null,
    }),
  );
  return { topics: topicList(data.topics ?? body.topics), site_ids: Array.isArray(data.site_ids) ? (data.site_ids as number[]) : (body.site_ids ?? []), moved: moved.filter((m) => (KPI_TOPICS as readonly string[]).includes(m.topic)) };
}

// KPI-10 (wave D): the Overview tiles
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
/** `GET /kpi/overview` → `{readiness:[{framework, version, percent}], due:{due, sent_back, done}, period}`; also read when wrapped as `{overview}`. */
export async function getKpiOverview(companyId?: number | null): Promise<KpiOverview> {
  const root = obj(asRow<unknown>((await api.get("/kpi/overview", { params: companyParams(companyId) })).data, "overview"));
  const due = obj(root.due);
  const readiness = asList<Loose>(root, "readiness")
    .filter((r) => (FRAMEWORK_CODES as readonly string[]).includes(String(r.framework).toUpperCase()))
    .map((r) => ({ framework: String(r.framework).toUpperCase() as FrameworkCode, version: typeof r.version === "string" ? r.version : null, percent: r.percent == null ? null : Math.round(count(r.percent)) }));
  return { readiness, due: { due: count(due.due), sent_back: count(due.sent_back), done: count(due.done) }, period: typeof root.period === "string" ? root.period : null };
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
    topic_label: pick(raw.topic_label, kpi.topic_label, undefined),
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

// KPI-7 part 3: the My KPIs template (rows are only what the caller owns, D17)
const myParams = (period: string, siteId: number | null | undefined, companyId: number | null | undefined) => ({ period, ...(siteId ? { site: siteId } : {}), ...companyParams(companyId) });
/** `GET /kpi/my/template?period=&site=` → XLSX, saved under the server's file name. */
export async function downloadMyTemplate(period: string, siteId?: number | null, companyId?: number | null): Promise<{ blob: Blob; fileName: string | null }> {
  try {
    const res = await api.get<Blob>("/kpi/my/template", { params: myParams(period, siteId, companyId), responseType: "blob" });
    const disposition = (res.headers as Record<string, unknown> | undefined)?.["content-disposition"];
    return { blob: res.data, fileName: typeof disposition === "string" ? disposition : null };
  } catch (e) {
    throw await blobError(e);
  }
}
function readTemplateRow(r: Loose, i: number): KpiTemplateRow {
  const issue = obj(r.issue);
  const code = pick<unknown>(issue.code, r.issue_code, r.code_issue);
  const message = pick<unknown>(issue.message, r.issue_message, typeof r.issue === "string" ? r.issue : undefined);
  return {
    row: Number(pick(r.row, r.row_number, i + 2)),
    kpi_definition_id: (pick(r.kpi_definition_id, null) as number | null) ?? null,
    kpi_code: (pick(r.kpi_code, r.code, null) as string | null) ?? null,
    name: (pick(r.name, r.kpi_name, null) as string | null) ?? null,
    site_id: (pick(r.site_id, null) as number | null) ?? null,
    site_name: (pick(r.site_name, null) as string | null) ?? null,
    period_start: (pick(r.period_start, null) as string | null) ?? null,
    value: (pick(r.value, r.value_numeric, r.value_text, null) as number | string | null) ?? null,
    unit: (pick(r.unit, null) as string | null) ?? null,
    comment: (pick(r.comment, null) as string | null) ?? null,
    issue: code || message ? { code: String(code ?? ""), message: typeof message === "string" && message.trim() ? message : isKpiErrorCode(code) ? ERROR_MESSAGE[code] : "This row can't be saved." } : null,
  };
}
/** `POST /kpi/my/template` (multipart): plans the filled template like a bulk upload; answers `{plan}` (a bare plan is read too). */
export async function planMyTemplate(file: File, period: string, siteId?: number | null, companyId?: number | null): Promise<KpiTemplatePlan> {
  const form = new FormData();
  form.append("file", file);
  form.append("period", period);
  if (siteId) form.append("site", String(siteId));
  const root = obj(asRow<unknown>((await api.post("/kpi/my/template", form, { params: companyParams(companyId) })).data, "plan"));
  const rows = asList<Loose>(root, "rows").map(readTemplateRow);
  const c = obj(root.counts);
  const ready = rows.filter((r) => !r.issue).length;
  return { plan_id: String(root.plan_id ?? ""), rows, counts: { ready: typeof c.ready === "number" ? c.ready : ready, issues: typeof c.issues === "number" ? c.issues : rows.length - ready } };
}
/** `POST /kpi/my/template {plan_id, commit: true}`: the ready rows become drafts. */
export async function commitMyTemplate(planId: string, companyId?: number | null): Promise<KpiTemplateCommitResult> {
  const data = obj((await api.post("/kpi/my/template", { plan_id: planId, commit: true }, { params: companyParams(companyId) })).data);
  return { saved: Number(pick(data.saved, data.committed, 0)) || 0 };
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
/** `POST /kpi/auto/refresh?year=` (Manager and above): reads auto values again from the approved rows. */
export async function refreshAutoKpis(year: number, companyId?: number | null): Promise<KpiAutoRefreshResult> {
  const data = obj((await api.post("/kpi/auto/refresh", {}, { params: { year, ...companyParams(companyId) } })).data);
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    year: Number(data.year ?? year),
    refreshed: n(data.refreshed),
    unchanged: n(data.unchanged),
    removed: n(data.removed),
    locked: n(data.locked),
    values: asList<KpiValue>(data, "values"),
    formulas: asList<KpiValue>(data, "formulas"),
  };
}

// KPI-8: review and close
const readReview = (data: unknown): ReviewKpiValuesResult => {
  const d = obj(data);
  return { updated: asList<number>(d, "updated").map(Number), refused: asList<ReviewKpiValuesResult["refused"][number]>(d, "refused") };
};
/** `PUT /kpi/values/approve {ids, only_ready?}` (Manager, Superadmin): `{updated, refused:[{id, code}]}`. */
export const approveKpiValues = async (ids: number[], opts: { onlyReady?: boolean; keepalive?: boolean } = {}, companyId?: number | null) =>
  readReview((await api.put("/kpi/values/approve", { ids, ...(opts.onlyReady ? { only_ready: true } : {}) }, { params: companyParams(companyId), ...(opts.keepalive ? { adapter: "fetch" as const, fetchOptions: { keepalive: true } } : {}) })).data);
/** `PUT /kpi/values/reject {ids, reason}`: the reason is required (`KPI_REASON_REQUIRED`). */
export const rejectKpiValues = async (ids: number[], reason: string, companyId?: number | null) =>
  readReview((await api.put("/kpi/values/reject", { ids, reason }, { params: companyParams(companyId) })).data);

/** `GET /kpi/periods/lock?year=&period=`: what's left per site and the locks. Missing parts read as empty. */
export async function getKpiPeriodLock(year: number, period: number | null, companyId?: number | null): Promise<KpiPeriodLockStatus> {
  const data = obj(asRow<unknown>((await api.get("/kpi/periods/lock", { params: { year, ...(period ? { period } : {}), ...companyParams(companyId) } })).data, "status"));
  const sites = asList<Loose>(data, "sites").map((s) => ({
    site_id: (s.site_id ?? null) as number | null,
    name: String(s.name ?? s.site_name ?? (s.site_id ? `Site ${s.site_id}` : "Company")),
    locked: !!s.locked,
    lock: (s.lock ?? null) as KpiPeriodLock | null,
    kpis: asList<KpiPeriodLockStatus["sites"][number]["kpis"][number]>(s, "kpis"),
  }));
  return { year: Number(data.year ?? year), period: (data.period ?? period ?? null) as number | null, sites, left: asList(data, "left") };
}
export const lockKpiPeriod = async (body: KpiLockBody, companyId?: number | null) =>
  asRow<KpiPeriodLock>((await api.post("/kpi/periods/lock", body, { params: companyParams(companyId) })).data, "lock");
export const unlockKpiPeriod = async (body: KpiUnlockBody, companyId?: number | null) =>
  asRow<KpiPeriodLock>((await api.post("/kpi/periods/unlock", body, { params: companyParams(companyId) })).data, "lock");

/** The `details.left` of a `KPI_PERIOD_INCOMPLETE` refusal, or an empty list. */
export function incompleteLeft(e: unknown): KpiPeriodLockStatus["left"] {
  const data = (e as { response?: { data?: { code?: unknown; details?: { left?: unknown } } } })?.response?.data;
  return data?.code === "KPI_PERIOD_INCOMPLETE" && Array.isArray(data.details?.left) ? (data.details.left as KpiPeriodLockStatus["left"]) : [];
}

// KPI-9: targets
const asStatus = (v: unknown): TargetStatus | null => ((TARGET_STATUSES as readonly unknown[]).includes(v) ? (v as TargetStatus) : null);
/** `GET /kpi/targets` (any role of the company): `{targets}` or a bare list. */
export const getKpiTargets = async (companyId?: number | null) =>
  asList<KpiTargetWithProgress>((await api.get("/kpi/targets", { params: companyParams(companyId) })).data, "targets").map((t) => ({ ...t, status: asStatus(t.status) }));
/** `PUT /kpi/targets` (Admin): an upsert; answers the saved target with its progress. */
export const saveKpiTarget = async (body: PutKpiTargetBody, companyId?: number | null) =>
  asRow<KpiTargetWithProgress>((await api.put("/kpi/targets", body, { params: companyParams(companyId) })).data, "target");
export const deleteKpiTarget = async (id: number, companyId?: number | null) => (await api.delete(`/kpi/targets/${id}`, { params: companyParams(companyId) })).data as unknown;

// KPI-10: dashboard
export type DashboardQuery = { year: number; framework?: FrameworkCode | null; site?: number | null; topic?: string | null };
export async function getKpiDashboard(q: DashboardQuery, companyId?: number | null): Promise<KpiDashboard> {
  const params = { year: q.year, ...(q.framework ? { framework: q.framework } : {}), ...(q.site ? { site: q.site } : {}), ...(q.topic ? { topic: q.topic } : {}), ...companyParams(companyId) };
  return readDashboard((await api.get("/kpi/dashboard", { params })).data, q.year);
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const isFramework = (v: unknown): v is FrameworkCode => (FRAMEWORK_CODES as readonly unknown[]).includes(v);

/** The dashboard as the KPI-10 spec words it (`coverage`, `gaps`, `cards`, `pending_not_in`), also reading the KPI-0 mock shape. */
export function readDashboard(data: unknown, year: number): KpiDashboard {
  const root = obj(asRow<unknown>(data, "dashboard"));
  const coverageRaw = Array.isArray(root.coverage) ? root.coverage : Array.isArray(root.frameworks) ? root.frameworks : [];
  const coverage: KpiCoverage[] = (coverageRaw as Loose[])
    .map((c): Loose => ({ ...c, framework: String(c.framework ?? c.code ?? "").toUpperCase() }))
    .filter((c) => isFramework(c.framework))
    .map((c) => {
      const core = obj(c.core);
      const required = num(c.required) ?? 0;
      const missing = num(c.missing) ?? num(c.gaps) ?? 0;
      return {
        framework: c.framework as FrameworkCode,
        version: (c.version as string | null) ?? null,
        required,
        approved: num(c.approved) ?? 0,
        pending: num(c.pending) ?? 0,
        missing,
        percent: num(c.percent) ?? 0,
        core: c.core ? { done: num(core.done) ?? 0, total: num(core.total) ?? 0 } : null,
        excluded: num(c.excluded) ?? undefined,
        material_topics: num(c.material_topics),
      };
    });
  const gaps: KpiGap[] = asList<Loose>(root, "gaps").map((g) => {
    const kpi = obj(g.kpi);
    const site = obj(g.site);
    const owner = obj(g.owner);
    const missing = g.periods_missing ?? g.missing_periods ?? [];
    const fws = (Array.isArray(g.frameworks) ? g.frameworks : Array.isArray(kpi.frameworks) ? kpi.frameworks : []) as unknown[];
    return {
      kpi_definition_id: Number(pick(g.kpi_definition_id, kpi.id, kpi.kpi_definition_id, typeof g.kpi === "number" ? g.kpi : undefined)),
      kpi_name: String(pick(g.kpi_name, kpi.name, "") ?? ""),
      site_id: (pick(g.site_id, site.site_id, site.id, typeof g.site === "number" ? g.site : undefined) ?? null) as number | null,
      site_name: (pick(g.site_name, site.name, typeof g.site === "string" ? g.site : undefined) ?? null) as string | null,
      periods_missing: Array.isArray(missing) ? missing.map(String) : typeof missing === "number" ? [] : [],
      owner_user_id: (pick(g.owner_user_id, owner.user_id, owner.id, typeof g.owner === "number" ? g.owner : undefined) ?? null) as number | null,
      owner_name: (pick(g.owner_name, owner.name, typeof g.owner === "string" ? g.owner : undefined) ?? null) as string | null,
      link: typeof g.link === "string" && g.link ? g.link : null,
      frameworks: fws.map((f) => String(f).toUpperCase()).filter(isFramework),
      pending: g.pending === true,
    };
  });
  const cards: KpiDashboardCard[] = asList<Loose>(root, "cards").map((c) => {
    const kpi = obj(c.kpi);
    const target = c.target && typeof c.target === "object" ? obj(c.target) : null;
    const rawSeries = (Array.isArray(c.series) ? c.series : Array.isArray(c.monthly) ? c.monthly : []) as unknown[];
    const series = rawSeries.map((p, i) => (p && typeof p === "object" ? { period: String(obj(p).period ?? obj(p).label ?? i + 1), value: num(obj(p).value) } : { period: String(i + 1), value: num(p) }));
    const progress = target ? num(target.progress_pct) : num(c.target_progress_pct);
    return {
      kpi_definition_id: Number(pick(c.kpi_definition_id, kpi.id)),
      code: String(pick(c.code, kpi.code, "") ?? ""),
      name: String(pick(c.name, kpi.name, "") ?? ""),
      topic: pick(c.topic, kpi.topic, "governance"),
      source: (pick(c.source, kpi.source, null) ?? null) as KpiDashboardCard["source"],
      unit: (pick(c.unit, kpi.unit, kpi.canonical_unit, null) ?? null) as string | null,
      decimals: num(pick(c.decimals, kpi.decimals)),
      value: num(c.value),
      previous: num(pick(c.previous, c.last_year)),
      change_pct: num(c.change_pct),
      series,
      target:
        target || progress !== null
          ? { progress_pct: progress, status: asStatus(target?.status ?? c.target_status), label: (target?.label as string | undefined) ?? null, target_id: num(target?.id ?? target?.target_id) }
          : null,
    };
  });
  const pendingRaw = root.pending_not_in;
  const pendingObj = obj(pendingRaw);
  const pending_not_in =
    typeof pendingRaw === "number"
      ? { count: pendingRaw }
      : pendingRaw && typeof pendingRaw === "object"
        ? { count: num(pendingObj.count) ?? num(pendingObj.kpi) ?? (Array.isArray(pendingObj.value_ids) ? pendingObj.value_ids.length : 0), value_ids: Array.isArray(pendingObj.value_ids) ? pendingObj.value_ids.map(Number) : undefined, emissions: num(pendingObj.emissions) ?? undefined }
        : { count: num(root.pending_count) ?? 0 };
  return { year: num(root.year) ?? year, coverage, gaps, cards, pending_not_in };
}

/** `POST /kpi/dashboard/remind {kpi, site}` (Manager+): asks the owner for the missing values; at most once a day per item. */
export async function remindKpiOwner(kpi: number, site: number | null, companyId?: number | null): Promise<KpiRemindResult> {
  const d = obj((await api.post("/kpi/dashboard/remind", { kpi, site }, { params: companyParams(companyId) })).data);
  return { reminded: d.reminded !== false && d.sent !== false, owner_name: (d.owner_name as string | undefined) ?? null, message: (d.message as string | undefined) ?? null };
}

// KPI-11: framework reports
export type ReportQuery = { framework: FrameworkCode; year: number; sites?: number[] };
const reportParams = (q: ReportQuery, format: ReportFormat, companyId?: number | null) => ({
  year: q.year,
  format,
  ...(q.sites?.length ? { sites: q.sites.join(",") } : {}),
  ...companyParams(companyId),
});
export async function getKpiReport(q: ReportQuery, companyId?: number | null): Promise<KpiFrameworkReport> {
  return readReport((await api.get(`/kpi/reports/${q.framework}`, { params: reportParams(q, "json", companyId) })).data, q);
}

/** The report model, wrapped as `{report}` or not; rows may carry `kpis` and `values` as objects (the KPI-11 spec words) instead of id lists. */
export function readReport(data: unknown, q: Pick<ReportQuery, "framework" | "year">): KpiFrameworkReport {
  const root = obj(asRow<unknown>(data, "report"));
  const ids = (v: unknown, key: string) => (Array.isArray(v) ? v.map((x) => Number(x && typeof x === "object" ? (x as Loose)[key] ?? (x as Loose).id : x)).filter((n) => Number.isFinite(n)) : undefined);
  const rows: KpiReportRow[] = asList<Loose>(root, "rows").map((r) => {
    const disclosure = obj(r.disclosure);
    return {
      ...(r as unknown as KpiReportRow),
      disclosure_id: Number(pick(r.disclosure_id, disclosure.id)),
      code: String(pick(r.code, disclosure.code, "") ?? ""),
      title: String(pick(r.title, disclosure.title, "") ?? ""),
      section: String(pick(r.section, disclosure.section, "") ?? ""),
      value: (pick(r.value, null) ?? null) as KpiReportRow["value"],
      unit: (pick(r.unit, r.display_unit, null) ?? null) as string | null,
      previous: (pick(r.previous, r.previous_year, null) ?? null) as KpiReportRow["previous"],
      where: (r.where === "site" || r.where === "company" ? r.where : null) as KpiReportRow["where"],
      notes: (pick(r.notes, r.note, null) ?? null) as string | null,
      kpi_definition_ids: ids(r.kpi_definition_ids ?? r.kpis, "kpi_definition_id"),
      value_ids: ids(r.value_ids ?? r.values, "id"),
      evidence_count: num(r.evidence_count) ?? undefined,
    };
  });
  const omissions = asList<KpiReportOmission>(root, "omissions").map((o) => ({ ...o, disclosure_id: o.disclosure_id ?? null, reason: o.reason ?? "" }));
  return {
    framework: (isFramework(root.framework) ? root.framework : q.framework) as FrameworkCode,
    version: String(root.version ?? ""),
    year: num(root.year) ?? q.year,
    pending_count: num(root.pending_count) ?? (Array.isArray(root.pending_ids) ? root.pending_ids.length : 0),
    pending_ids: Array.isArray(root.pending_ids) ? root.pending_ids.map(Number) : undefined,
    rows,
    omissions,
  };
}

/** Downloads the XLSX (all frameworks) or the PDF (GRI) with the auth header; answers the file and its name. */
export async function downloadKpiReport(q: ReportQuery, format: Exclude<ReportFormat, "json">, companyId?: number | null): Promise<{ blob: Blob; fileName: string | null }> {
  try {
    const res = await api.get<Blob>(`/kpi/reports/${q.framework}`, { params: reportParams(q, format, companyId), responseType: "blob" });
    const disposition = (res.headers as Record<string, unknown> | undefined)?.["content-disposition"];
    return { blob: res.data, fileName: typeof disposition === "string" ? disposition : null };
  } catch (e) {
    throw await blobError(e);
  }
}

/** A blob request's error body is JSON inside a Blob: read it so `kpiErrorMessage` shows the server's words. */
async function blobError(e: unknown): Promise<unknown> {
  const res = (e as { response?: { status?: number; data?: unknown } })?.response;
  if (!res || typeof Blob === "undefined" || !(res.data instanceof Blob)) return e;
  try {
    return { response: { status: res.status, data: JSON.parse(await res.data.text()) as unknown } };
  } catch {
    return e;
  }
}

/** A plain message for a per-item refusal code (`PUT /kpi/values` results); never the code itself. */
export const codeMessage = (code: unknown, fallback: string) => (isKpiErrorCode(code) ? ERROR_MESSAGE[code] : fallback);

/** The server's message, or a plain one for a KPI error code; never the raw code. */
export function kpiErrorMessage(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { code?: unknown; message?: unknown } } })?.response?.data;
  if (isKpiErrorCode(data?.code)) return ERROR_MESSAGE[data.code];
  return typeof data?.message === "string" && data.message ? data.message : fallback;
}

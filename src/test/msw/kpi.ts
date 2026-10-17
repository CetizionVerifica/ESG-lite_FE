/**
 * Mock handlers for every KPI endpoint of docs/kpi/01-contracts.md §3
 * (KPI-0), so each lane builds and tests its screens before its backend
 * lands. Sample data: `kpiData.ts` (ACME, three plants, GRI + BRSR + ESRS).
 * Stateful like the backend: a test can save, submit, approve, lock and read
 * the result back. `resetKpiMocks()` restores the sample.
 *
 * Use in a test:
 *   const server = setupServer(...kpiHandlers);   // from "msw/node", or `handlers` from ./index
 *   beforeEach(() => resetKpiMocks());
 *
 * `setKpiMockEnabled(false)` turns ACME's switch off: every route but
 * `/kpi/status` and `/kpi/library/*` then answers 403 `KPI_TRACKING_OFF`.
 * Shapes marked "mock shape" in `src/lib/kpi/contracts.ts` are the owning
 * module's to confirm. Roles aren't modelled: the caller is Ravi (User,
 * Bahrain plant) for `/kpi/my`, and every write is allowed.
 */
import { http, HttpResponse } from "msw";
import {
  type CustomKpiBody,
  FRAMEWORK_CODES,
  type FrameworkCode,
  KPI_ERROR_STATUS,
  type KpiAutoRefreshResult,
  type KpiCatalogue,
  type KpiDashboard,
  type KpiDefinition,
  type KpiDisclosure,
  type KpiDisclosureMap,
  type KpiErrorBody,
  type KpiErrorCode,
  type KpiFramework,
  type KpiFrameworkReport,
  type KpiLockBody,
  type KpiLockLeftItem,
  type KpiPeriodLock,
  type KpiPeriodLockStatus,
  type KpiSetup,
  type KpiStatus,
  type KpiTargetWithProgress,
  type KpiUnlockBody,
  type KpiValue,
  type KpiValueEvidence,
  type KpiValueInput,
  type KpiValueUpsertResult,
  type MyKpiGroup,
  type MyKpiItem,
  type MyKpis,
  type PutKpiSetupBody,
  type PutKpiTargetBody,
  type PutKpiValuesBody,
  type PutKpiValuesResult,
  type ReviewKpiValuesBody,
  type ReviewKpiValuesResult,
  type SubmitKpiValuesBody,
  type SubmitKpiValuesResult,
  type SuggestMappingResult,
  type SuggestValuesResult,
} from "../../lib/kpi/contracts";
import {
  ACME,
  ACME_ASSIGNMENTS,
  ACME_COMPANY_KPIS,
  ACME_MATERIAL_TOPICS,
  BRSR_CORE_KPI_IDS,
  KPI_DEFINITIONS,
  KPI_DISCLOSURES,
  KPI_EVIDENCE_SEED,
  KPI_FRAMEWORKS,
  KPI_MAPPINGS,
  KPI_SITES,
  KPI_TARGETS_SEED,
  KPI_VALUES_SEED,
  RAVI_KPI_CODES,
  kpiByCode,
} from "./kpiData";

export * from "./kpiData";

/** Ravi Kumar, the contributor `/kpi/my` answers for. */
const CALLER = { user_id: 11, site_id: 1 };
const NOW = "2026-10-12T09:00:00.000Z";

const copy = <T>(v: T): T => structuredClone(v);

const initialState = () => ({
  enabled: true,
  definitions: copy(KPI_DEFINITIONS),
  frameworks: copy(KPI_FRAMEWORKS),
  disclosures: copy(KPI_DISCLOSURES),
  mappings: copy(KPI_MAPPINGS),
  setup: {
    settings: { company_id: ACME.company_id, year_type: "CY", first_year: 2026, due_day: 15, setup_completed_at: "2026-09-02T09:30:00.000Z" },
    frameworks: KPI_FRAMEWORKS.map((f) => ({ company_id: ACME.company_id, framework_id: f.id, enabled_at: "2026-09-02T09:00:00.000Z", enabled_by: 13 })),
    material_topics: copy(ACME_MATERIAL_TOPICS),
    kpis: copy(ACME_COMPANY_KPIS),
    assignments: copy(ACME_ASSIGNMENTS),
  } as KpiSetup,
  values: copy(KPI_VALUES_SEED),
  evidence: copy(KPI_EVIDENCE_SEED),
  locks: [] as KpiPeriodLock[],
  targets: copy(KPI_TARGETS_SEED),
});

let state = initialState();

/** Back to the sample data, switch on. Call in `beforeEach`. */
export function resetKpiMocks(): void {
  state = initialState();
}

/** Turns ACME's KPI tracking switch on or off for the following requests. */
export function setKpiMockEnabled(enabled: boolean): void {
  state.enabled = enabled;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const error = (code: KpiErrorCode, message: string, details?: unknown) =>
  HttpResponse.json<KpiErrorBody>({ code, message, ...(details === undefined ? {} : { details }) }, { status: KPI_ERROR_STATUS[code] });
const notFound = (message: string) => HttpResponse.json({ message }, { status: 404 });
const badRequest = (message: string) => HttpResponse.json({ message }, { status: 400 });

type MswResolver = Parameters<typeof http.get>[1];
type Info = Parameters<MswResolver>[0];
type Resolver = (info: Info) => Response | Promise<Response>;

/** Wraps a resolver behind the switch, like `requireKpiTracking`. */
const gated = (resolver: Resolver): MswResolver =>
  ((info: Info) => (state.enabled ? resolver(info) : error("KPI_TRACKING_OFF", "KPI tracking isn't turned on for this company."))) as MswResolver;

const nextId = (rows: { id: number }[]) => rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
const kpiOf = (id: number) => state.definitions.find((d) => d.id === id);
const siteName = (id: number | null) => KPI_SITES.find((s) => s.site_id === id)?.name ?? null;

/** `?framework=` takes a framework id or a code (all its versions). */
function frameworkIds(param: string | null): Set<number> | null {
  if (!param) return null;
  const asId = Number(param);
  if (Number.isInteger(asId) && asId > 0) return new Set([asId]);
  return new Set(state.frameworks.filter((f) => f.code === param.toUpperCase()).map((f) => f.id));
}

/** Units the mock converts to the canonical one; anything else keeps its number. */
const TO_CANONICAL: Record<string, number> = { kL: 1, litres: 0.001, ML: 1000, kg: 0.001, kWh: 0.001, GJ: 1 / 3.6 };

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const lastDay = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** Where an item sits on My KPIs: nothing yet or a draft = due; rejected = sent back; pending or approved = done. */
export function myKpiGroup(value: Pick<KpiValue, "status"> | null): MyKpiGroup {
  if (!value || value.status === "draft") return "due";
  return value.status === "rejected" ? "sent_back" : "done";
}

/** The period of a KPI that ends in month `ym`, or null when none does (quarterly KPIs end in Mar/Jun/Sep/Dec). */
function periodEnding(def: KpiDefinition, ym: string): { start: string; end: string } | null {
  const month = Number(ym.slice(5, 7));
  const months = def.default_frequency === "monthly" ? 1 : def.default_frequency === "quarterly" ? 3 : 12;
  if (month % months !== 0) return null;
  const start = addMonths(ym, 1 - months);
  return { start: `${start}-01`, end: lastDay(ym) };
}

function usedIn(kpiId: number): MyKpiItem["used_in"] {
  return state.mappings
    .filter((m) => m.kpi_definition_id === kpiId)
    .map((m) => state.disclosures.find((d) => d.id === m.disclosure_id) as KpiDisclosure)
    .map((d) => {
      const fw = state.frameworks.find((f) => f.id === d.framework_id) as KpiFramework;
      return { framework: fw.code, code: d.code, ...(d.requirement === "core" ? { core: true } : {}) };
    });
}

function myKpis(period: string): MyKpis {
  const items: MyKpiItem[] = [];
  for (const code of RAVI_KPI_CODES) {
    const def = kpiOf(kpiByCode(code).id) as KpiDefinition;
    const p = periodEnding(def, period);
    if (!p) continue;
    const value = state.values.find((v) => v.kpi_definition_id === def.id && v.site_id === CALLER.site_id && v.period_start === p.start) ?? null;
    const lastStart = `${Number(p.start.slice(0, 4)) - 1}${p.start.slice(4)}`;
    const last = state.values.find((v) => v.kpi_definition_id === def.id && v.site_id === CALLER.site_id && v.period_start === lastStart);
    items.push({
      kpi_definition_id: def.id,
      code: def.code,
      name: def.name,
      question: def.question,
      help: def.help,
      topic: def.topic,
      source: def.source,
      value_type: def.value_type,
      canonical_unit: def.canonical_unit,
      allowed_units: def.allowed_units,
      site_id: CALLER.site_id,
      site_name: siteName(CALLER.site_id),
      period_start: p.start,
      period_end: p.end,
      frequency: def.default_frequency,
      due_date: `${addMonths(period, 1)}-${String(state.setup.settings.due_day).padStart(2, "0")}`,
      group: myKpiGroup(value),
      value,
      last_value: last ? { value: last.value_numeric, unit: last.unit, period_start: last.period_start } : null,
      used_in: usedIn(def.id),
    });
  }
  const counts = { due: 0, sent_back: 0, done: 0, total: items.length };
  for (const i of items) counts[i.group] += 1;
  return { period, items, counts };
}

function upsert(item: KpiValueInput, index: number): KpiValueUpsertResult {
  const def = kpiOf(item.kpi_definition_id);
  if (!def) return { index, ok: false, code: "KPI_NOT_SELECTED", message: "This KPI isn't in the company's list." };
  if (!state.setup.kpis.find((k) => k.kpi_definition_id === def.id)?.selected) return { index, ok: false, code: "KPI_NOT_SELECTED", message: "The company doesn't track this KPI." };
  if (def.source !== "manual") return { index, ok: false, code: "KPI_AUTO_READ_ONLY", message: "Auto and calculated values can't be written." };
  if (item.unit && def.allowed_units.length && !def.allowed_units.includes(item.unit)) return { index, ok: false, code: "KPI_UNIT_NOT_ALLOWED", message: `Use one of ${def.allowed_units.join(", ")}.` };
  if (def.value_type === "percent" && item.value_numeric != null && (item.value_numeric < 0 || item.value_numeric > 100)) return { index, ok: false, code: "KPI_VALUE_INVALID", message: "A percentage is between 0 and 100." };
  const year = Number(item.period_start.slice(0, 4));
  if (state.locks.some((l) => l.year === year && (l.site_id === null || l.site_id === item.site_id) && !l.reopened_at)) {
    return { index, ok: false, code: "KPI_PERIOD_LOCKED", message: "This period is locked." };
  }
  const existing = item.id
    ? state.values.find((v) => v.id === item.id)
    : state.values.find((v) => v.kpi_definition_id === def.id && v.site_id === item.site_id && v.period_start === item.period_start && v.frequency === item.frequency);
  if (existing && existing.status !== "draft" && existing.status !== "rejected") return { index, ok: false, code: "KPI_NOT_DRAFT", message: "This value was already sent for review." };
  const unit = item.unit ?? def.canonical_unit;
  const numeric = item.value_numeric ?? null;
  const canonical = numeric === null ? null : numeric * (unit && unit !== def.canonical_unit ? (TO_CANONICAL[unit] ?? 1) : 1);
  const base: KpiValue = existing ?? {
    id: nextId(state.values),
    company_id: ACME.company_id,
    site_id: item.site_id,
    kpi_definition_id: def.id,
    period_start: item.period_start,
    period_end: periodEnding(def, addMonths(item.period_start.slice(0, 7), (item.frequency === "monthly" ? 1 : item.frequency === "quarterly" ? 3 : 12) - 1))?.end ?? item.period_start,
    frequency: item.frequency,
    year_type: state.setup.settings.year_type,
    value_numeric: null,
    value_text: null,
    unit: null,
    value_canonical: null,
    breakdown: null,
    source: "manual",
    status: "draft",
    is_estimate: false,
    comment: null,
    entered_by: CALLER.user_id,
    submitted_at: null,
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    checks: null,
    auto_snapshot: null,
    created_at: NOW,
    updated_at: NOW,
  };
  const saved: KpiValue = {
    ...base,
    value_numeric: numeric,
    value_text: item.value_text ?? null,
    unit,
    value_canonical: canonical,
    breakdown: item.breakdown ?? base.breakdown,
    is_estimate: item.is_estimate ?? base.is_estimate,
    comment: item.comment ?? base.comment,
    status: "draft",
    updated_at: NOW,
  };
  state.values = existing ? state.values.map((v) => (v.id === saved.id ? saved : v)) : [...state.values, saved];
  return { index, ok: true, value: saved };
}

function lockStatus(year: number, period: number | null): KpiPeriodLockStatus {
  const ym = period ? `${year}-${String(period).padStart(2, "0")}` : `${year}-12`;
  const selected = state.setup.kpis.filter((k) => k.selected).map((k) => kpiOf(k.kpi_definition_id) as KpiDefinition);
  const left: KpiLockLeftItem[] = [];
  const sites = KPI_SITES.map((s) => {
    const kpis = selected
      .filter((d) => d.level === "site" && d.source === "manual" && periodEnding(d, ym))
      .map((d) => {
        const start = (periodEnding(d, ym) as { start: string }).start;
        const rows = state.values.filter((v) => v.kpi_definition_id === d.id && v.site_id === s.site_id && v.period_start === start);
        const counts = { draft: 0, pending: 0, approved: 0, rejected: 0 };
        for (const r of rows) counts[r.status] += 1;
        const missing = rows.length === 0;
        const reason = missing ? "missing" : counts.rejected ? "rejected" : counts.pending ? "pending" : counts.draft ? "draft" : null;
        if (reason) left.push({ site_id: s.site_id, site_name: s.name, kpi_definition_id: d.id, kpi_name: d.name, reason });
        return { kpi_definition_id: d.id, name: d.name, counts, missing };
      });
    const lock = state.locks.find((l) => l.year === year && l.period === period && (l.site_id === s.site_id || l.site_id === null) && !l.reopened_at) ?? null;
    return { site_id: s.site_id, name: s.name, locked: !!lock, lock, kpis };
  });
  return { year, period, sites, left };
}

function report(framework: FrameworkCode, year: number): KpiFrameworkReport {
  const fw = state.frameworks.find((f) => f.code === framework) as KpiFramework;
  const disclosures = state.disclosures.filter((d) => d.framework_id === fw.id).sort((a, b) => a.sort_key - b.sort_key);
  const rows: KpiFrameworkReport["rows"] = [];
  const omissions: KpiFrameworkReport["omissions"] = [];
  for (const d of disclosures) {
    const maps = state.mappings.filter((m) => m.disclosure_id === d.id);
    if (!maps.length) {
      omissions.push({ disclosure_id: d.id, code: d.code, title: d.title, reason: "No KPI answers this disclosure yet." });
      continue;
    }
    const first = kpiOf(maps[0].kpi_definition_id) as KpiDefinition;
    const approved = state.values.filter((v) => v.kpi_definition_id === first.id && v.status === "approved" && v.period_start.startsWith(String(year)));
    rows.push({
      disclosure_id: d.id,
      code: d.code,
      title: d.title,
      section: d.section,
      value: approved.length ? approved.reduce((s, v) => s + (v.value_canonical ?? 0), 0) : null,
      unit: maps[0].display_unit,
      where: first.level,
      notes: maps[0].note,
    });
  }
  return { framework, version: fw.version, year, pending_count: state.values.filter((v) => v.status === "pending").length, rows, omissions };
}

const json = async <T>(request: Request): Promise<Partial<T>> => {
  try {
    return ((await request.json()) ?? {}) as Partial<T>;
  } catch {
    return {};
  }
};

/** `definitions` -> `definition`: the server answers a write with the row under its singular name. */
const singular = (name: string) => name.replace(/s$/, "");

/** POST and PUT for a library collection: `POST /kpi/library/<name>` and `PUT /kpi/library/<name>/:id`. */
function libraryWrite<T extends { id: number }>(name: string, rows: () => T[], set: (rows: T[]) => void, check?: (row: T) => Response | null) {
  return [
    http.post(`*/kpi/library/${name}`, async ({ request }) => {
      const body = await json<T>(request);
      const row = { ...body, id: nextId(rows()) } as T;
      const refused = check?.(row);
      if (refused) return refused;
      set([...rows(), row]);
      return HttpResponse.json({ [singular(name)]: row }, { status: 201 });
    }),
    http.put(`*/kpi/library/${name}/:id`, async ({ request, params }) => {
      const id = Number(params.id);
      const current = rows().find((r) => r.id === id);
      if (!current) return notFound("Not found.");
      const row = { ...current, ...(await json<T>(request)), id } as T;
      const refused = check?.(row);
      if (refused) return refused;
      set(rows().map((r) => (r.id === id ? row : r)));
      return HttpResponse.json({ [singular(name)]: row });
    }),
  ];
}

/** Formula codes a definition uses that the library doesn't have. */
const unknownFormulaCodes = (formula: string | null, defs: KpiDefinition[]) =>
  (formula?.match(/[A-Z][A-Z0-9_]+/g) ?? []).filter((c) => !defs.some((d) => d.code === c));

function checkDefinition(row: KpiDefinition): Response | null {
  if (!row.code || !row.name || !row.question) return badRequest("Code, name and question are required.");
  if (state.definitions.some((d) => d.code === row.code && d.id !== row.id && d.company_id === null)) return error("KPI_CODE_TAKEN", "That code is already used.");
  if (row.source === "formula" && (!row.formula || unknownFormulaCodes(row.formula, state.definitions).length || row.formula.includes(row.code))) {
    return error("KPI_FORMULA_INVALID", "The formula uses an unknown KPI code or refers to itself.");
  }
  if (row.canonical_unit && row.allowed_units?.length && !row.allowed_units.includes(row.canonical_unit)) return error("KPI_UNIT_NOT_ALLOWED", "The allowed units must include the canonical unit.");
  return null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const kpiHandlers = [
  // KPI-1
  http.get("*/kpi/status", () => HttpResponse.json<KpiStatus>({ enabled: state.enabled, setup_completed: state.enabled && !!state.setup.settings.setup_completed_at })),

  // KPI-2: library (Superadmin, not behind the switch)
  http.get("*/kpi/library/frameworks", () => HttpResponse.json({ frameworks: state.frameworks })),
  http.get("*/kpi/library/definitions", ({ request }) => {
    const q = new URL(request.url).searchParams;
    const fw = frameworkIds(q.get("framework"));
    const mapped = fw ? new Set(state.mappings.filter((m) => fw.has(state.disclosures.find((d) => d.id === m.disclosure_id)?.framework_id ?? 0)).map((m) => m.kpi_definition_id)) : null;
    const rows = state.definitions.filter(
      (d) => d.company_id === null && (!mapped || mapped.has(d.id)) && (!q.get("topic") || d.topic === q.get("topic")) && (!q.get("source") || d.source === q.get("source")),
    );
    return HttpResponse.json({ definitions: rows });
  }),
  http.get("*/kpi/library/disclosures", ({ request }) => {
    const fw = frameworkIds(new URL(request.url).searchParams.get("framework"));
    return HttpResponse.json({ disclosures: state.disclosures.filter((d) => !fw || fw.has(d.framework_id)) });
  }),
  http.get("*/kpi/library/mappings", ({ request }) => {
    const fw = frameworkIds(new URL(request.url).searchParams.get("framework"));
    return HttpResponse.json({ mappings: state.mappings.filter((m) => !fw || fw.has(state.disclosures.find((d) => d.id === m.disclosure_id)?.framework_id ?? 0)) });
  }),
  ...libraryWrite<KpiDefinition>(
    "definitions",
    () => state.definitions,
    (rows) => (state.definitions = rows),
    (row) => checkDefinition({ ...row, company_id: row.company_id ?? null, created_at: row.created_at ?? NOW, active: row.active ?? true }),
  ),
  ...libraryWrite<KpiFramework>("frameworks", () => state.frameworks, (rows) => (state.frameworks = rows), (row) =>
    (FRAMEWORK_CODES as readonly string[]).includes(row.code) && row.version ? null : badRequest("A framework needs a known code and a version."),
  ),
  ...libraryWrite<KpiDisclosure>("disclosures", () => state.disclosures, (rows) => (state.disclosures = rows), (row) =>
    state.frameworks.some((f) => f.id === row.framework_id) && row.code && row.source_url ? null : badRequest("A disclosure needs a framework, a code and a source link."),
  ),
  ...libraryWrite<KpiDisclosureMap>("mappings", () => state.mappings, (rows) => (state.mappings = rows), (row) =>
    state.disclosures.some((d) => d.id === row.disclosure_id) && state.definitions.some((d) => d.id === row.kpi_definition_id) ? null : badRequest("A mapping needs an existing disclosure and KPI."),
  ),

  // KPI-2: the catalogue as the company sees it
  http.get(
    "*/kpi/catalogue",
    gated(() => {
      const enabled = new Set(state.setup.frameworks.map((f) => f.framework_id));
      const disclosures = state.disclosures.filter((d) => enabled.has(d.framework_id));
      const ids = new Set(disclosures.map((d) => d.id));
      return HttpResponse.json<KpiCatalogue>({
        frameworks: state.frameworks.filter((f) => enabled.has(f.id)),
        disclosures,
        definitions: state.definitions.filter((d) => d.active && (d.company_id === null || d.company_id === ACME.company_id)),
        mappings: state.mappings.filter((m) => ids.has(m.disclosure_id)),
      });
    }),
  ),

  // KPI-3: setup
  http.get("*/kpi/setup", gated(() => HttpResponse.json<KpiSetup>(state.setup))),
  http.put(
    "*/kpi/setup",
    gated(async ({ request }) => {
      const body = await json<PutKpiSetupBody>(request);
      const missingReason = body.material_topics?.find((t) => !t.material && !t.reason?.trim()) ?? body.kpis?.find((k) => !k.selected && !k.reason_excluded?.trim());
      if (missingReason) return error("KPI_REASON_REQUIRED", "Give a reason for each topic marked not material and each KPI left out.");
      const s = state.setup;
      const { complete, ...settings } = body.settings ?? {};
      state.setup = {
        settings: { ...s.settings, ...settings, setup_completed_at: complete ? NOW : s.settings.setup_completed_at },
        frameworks: body.framework_ids ? body.framework_ids.map((id) => ({ company_id: ACME.company_id, framework_id: id, enabled_at: NOW, enabled_by: 13 })) : s.frameworks,
        material_topics: body.material_topics ? body.material_topics.map((t) => ({ ...t, company_id: ACME.company_id, decided_by: 13, decided_at: NOW })) : s.material_topics,
        kpis: body.kpis ? body.kpis.map((k) => ({ ...k, company_id: ACME.company_id })) : s.kpis,
        assignments: body.assignments ? body.assignments.map((a) => ({ ...a, company_id: ACME.company_id })) : s.assignments,
      };
      return HttpResponse.json<KpiSetup>(state.setup);
    }),
  ),
  http.post(
    "*/kpi/setup/custom-kpis",
    gated(async ({ request }) => {
      const body = await json<CustomKpiBody>(request);
      if (!body.name?.trim() || !body.question?.trim()) return badRequest("A custom KPI needs a name and a question.");
      const id = nextId(state.definitions);
      const row: KpiDefinition = {
        id,
        code: `CUSTOM_${id}`,
        name: body.name,
        question: body.question,
        help: body.help ?? null,
        topic: body.topic ?? "governance",
        value_type: body.value_type ?? "number",
        unit_dimension: body.unit_dimension ?? "none",
        canonical_unit: body.canonical_unit ?? null,
        allowed_units: body.allowed_units ?? [],
        aggregation: body.aggregation ?? "sum",
        level: body.level ?? "site",
        default_frequency: body.default_frequency ?? "monthly",
        source: "manual",
        auto_source: null,
        formula: null,
        breakdowns: null,
        decimals: body.decimals ?? 1,
        company_id: ACME.company_id,
        active: true,
        created_at: NOW,
      };
      state.definitions = [...state.definitions, row];
      state.setup.kpis = [...state.setup.kpis, { company_id: ACME.company_id, kpi_definition_id: id, selected: true, frequency: null, reason_excluded: null }];
      return HttpResponse.json<KpiDefinition>(row, { status: 201 });
    }),
  ),

  // KPI-7: what the caller owes
  http.get(
    "*/kpi/my",
    gated(({ request }) => {
      const period = new URL(request.url).searchParams.get("period") ?? "2026-09";
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return badRequest("period is YYYY-MM.");
      return HttpResponse.json<MyKpis>(myKpis(period));
    }),
  ),

  // KPI-4: values
  http.get(
    "*/kpi/values",
    gated(({ request }) => {
      const q = new URL(request.url).searchParams;
      const statuses = q.get("status")?.split(",").filter(Boolean);
      const rows = state.values.filter(
        (v) =>
          (!q.get("kpi") || v.kpi_definition_id === Number(q.get("kpi"))) &&
          (!q.get("site") || v.site_id === Number(q.get("site"))) &&
          (!q.get("from") || v.period_start >= (q.get("from") as string)) &&
          (!q.get("to") || v.period_start <= (q.get("to") as string)) &&
          (!statuses?.length || statuses.includes(v.status)),
      );
      return HttpResponse.json<{ values: KpiValue[] }>({ values: rows });
    }),
  ),
  http.put(
    "*/kpi/values",
    gated(async ({ request }) => {
      const body = await json<PutKpiValuesBody>(request);
      if (!Array.isArray(body.items) || body.items.length === 0) return badRequest("items is a non-empty list.");
      const results = body.items.map((item, i) => upsert(item, i));
      return HttpResponse.json<PutKpiValuesResult>({ saved: results.filter((r) => r.ok).length, results });
    }),
  ),
  http.post(
    "*/kpi/values/submit",
    gated(async ({ request }) => {
      const { ids } = await json<SubmitKpiValuesBody>(request);
      if (!Array.isArray(ids) || ids.length === 0) return badRequest("ids is a non-empty list.");
      const result: SubmitKpiValuesResult = { submitted: [], refused: [] };
      for (const id of ids) {
        const v = state.values.find((x) => x.id === id);
        if (!v || v.status !== "draft") result.refused.push({ id, code: "KPI_NOT_DRAFT" });
        else if (BRSR_CORE_KPI_IDS.has(v.kpi_definition_id) && !state.evidence.some((e) => e.kpi_value_id === id)) result.refused.push({ id, code: "KPI_EVIDENCE_REQUIRED" });
        else {
          v.status = "pending";
          v.submitted_at = NOW;
          result.submitted.push(id);
        }
      }
      return HttpResponse.json(result);
    }),
  ),
  http.post(
    "*/kpi/values/:id/evidence",
    gated(({ params }) => {
      const id = Number(params.id);
      if (!state.values.some((v) => v.id === id)) return notFound("Value not found.");
      const row: KpiValueEvidence = { id: nextId(state.evidence), kpi_value_id: id, document_url: `https://assets.example.invalid/kpi/${id}.pdf`, document_name: "evidence.pdf", uploaded_by: CALLER.user_id, uploaded_at: NOW };
      state.evidence = [...state.evidence, row];
      return HttpResponse.json({ evidence: row }, { status: 201 });
    }),
  ),
  // data-loss-reviewed: mock handler only (no production data); removes one evidence row from the in-memory sample.
  http.delete(
    "*/kpi/values/:id/evidence/:eid",
    gated(({ params }) => {
      const before = state.evidence.length;
      state.evidence = state.evidence.filter((e) => !(e.id === Number(params.eid) && e.kpi_value_id === Number(params.id)));
      return state.evidence.length < before ? HttpResponse.json({ removed: Number(params.eid) }) : notFound("Evidence not found.");
    }),
  ),

  // KPI-8: review and close
  http.put(
    "*/kpi/values/:action",
    gated(async ({ request, params }) => {
      const action = params.action;
      if (action !== "approve" && action !== "reject") return notFound("Not found.");
      const body = await json<ReviewKpiValuesBody>(request);
      if (!Array.isArray(body.ids) || body.ids.length === 0) return badRequest("ids is a non-empty list.");
      if (action === "reject" && !body.reason?.trim()) return error("KPI_REASON_REQUIRED", "Say why the value is sent back.");
      const result: ReviewKpiValuesResult = { updated: [], refused: [] };
      for (const id of body.ids) {
        const v = state.values.find((x) => x.id === id);
        if (!v || v.status !== "pending") result.refused.push({ id, code: "NOT_PENDING" });
        else if (body.only_ready && v.checks?.length) result.refused.push({ id, code: "NOT_READY" });
        else {
          v.status = action === "approve" ? "approved" : "rejected";
          v.reviewed_by = 12;
          v.reviewed_at = NOW;
          v.review_comment = action === "reject" ? (body.reason as string) : null;
          result.updated.push(id);
        }
      }
      return HttpResponse.json(result);
    }),
  ),
  http.get(
    "*/kpi/periods/lock",
    gated(({ request }) => {
      const q = new URL(request.url).searchParams;
      const year = Number(q.get("year"));
      if (!Number.isInteger(year) || year < 2000) return badRequest("year is required.");
      const period = q.get("period") ? Number(q.get("period")) : null;
      return HttpResponse.json<KpiPeriodLockStatus>(lockStatus(year, period));
    }),
  ),
  http.post(
    "*/kpi/periods/lock",
    gated(async ({ request }) => {
      const body = await json<KpiLockBody>(request);
      if (!body.year) return badRequest("year is required.");
      const status = lockStatus(body.year, body.period ?? null);
      const left = status.left.filter((l) => body.site_id == null || l.site_id === body.site_id);
      if (left.length) return error("KPI_PERIOD_INCOMPLETE", "Some values are missing or not approved yet.", { left });
      const lock: KpiPeriodLock = { company_id: ACME.company_id, site_id: body.site_id ?? null, year: body.year, period: body.period ?? null, locked_by: 12, locked_at: NOW };
      state.locks = [...state.locks, lock];
      return HttpResponse.json(lock);
    }),
  ),
  http.post(
    "*/kpi/periods/unlock",
    gated(async ({ request }) => {
      const body = await json<KpiUnlockBody>(request);
      if (!body.reason?.trim()) return error("KPI_REASON_REQUIRED", "Say why the period is reopened.");
      const lock = state.locks.find((l) => l.year === body.year && l.period === (body.period ?? null) && l.site_id === (body.site_id ?? null) && !l.reopened_at);
      if (!lock) return notFound("This period isn't locked.");
      Object.assign(lock, { reopened_by: 12, reopened_at: NOW, reopened_reason: body.reason });
      return HttpResponse.json(lock);
    }),
  ),

  // KPI-5: auto values
  http.post(
    "*/kpi/auto/refresh",
    gated(({ request }) => {
      const year = Number(new URL(request.url).searchParams.get("year") ?? 2026);
      const values = state.values.filter((v) => v.source === "auto" && v.period_start.startsWith(String(year)));
      for (const v of values) v.auto_snapshot = { read_at: NOW, rows: v.auto_snapshot?.rows ?? 0, link: v.auto_snapshot?.link ?? null };
      return HttpResponse.json<KpiAutoRefreshResult>({ year, refreshed: values.length, values });
    }),
  ),

  // KPI-9: targets
  http.get("*/kpi/targets", gated(() => HttpResponse.json<KpiTargetWithProgress[]>(state.targets))),
  http.put(
    "*/kpi/targets",
    gated(async ({ request }) => {
      const body = await json<PutKpiTargetBody>(request);
      if (!body.kpi_definition_id || !kpiOf(body.kpi_definition_id)) return badRequest("Pick a KPI.");
      if (!body.target_year || body.baseline_year == null || body.target_year <= body.baseline_year) return badRequest("The target year comes after the baseline year.");
      const existing = body.id ? state.targets.find((t) => t.id === body.id) : undefined;
      const row: KpiTargetWithProgress = {
        id: existing?.id ?? nextId(state.targets),
        company_id: ACME.company_id,
        created_by: 13,
        current_value: existing?.current_value ?? null,
        current_year: existing?.current_year ?? null,
        progress_pct: existing?.progress_pct ?? null,
        kpi_definition_id: body.kpi_definition_id,
        site_id: body.site_id ?? null,
        baseline_year: body.baseline_year,
        baseline_value: body.baseline_value ?? 0,
        target_year: body.target_year,
        target_value: body.target_value ?? 0,
        direction: body.direction ?? "reduce",
        note: body.note ?? null,
      };
      state.targets = existing ? state.targets.map((t) => (t.id === row.id ? row : t)) : [...state.targets, row];
      return HttpResponse.json(row);
    }),
  ),
  // data-loss-reviewed: mock handler only (no production data); removes one target from the in-memory sample.
  http.delete(
    "*/kpi/targets/:id?",
    gated(({ request, params }) => {
      const id = Number(params.id ?? new URL(request.url).searchParams.get("id"));
      if (!state.targets.some((t) => t.id === id)) return notFound("Target not found.");
      state.targets = state.targets.filter((t) => t.id !== id);
      return HttpResponse.json({ removed: Number(params.eid) });
    }),
  ),

  // KPI-10: dashboard
  http.get(
    "*/kpi/dashboard",
    gated(({ request }) => {
      const year = Number(new URL(request.url).searchParams.get("year") ?? 2026);
      const card = (code: string, v: number, prev: number, monthly: (number | null)[], target: number | null): KpiDashboard["cards"][number] => {
        const d = kpiByCode(code);
        return { kpi_definition_id: d.id, code, name: d.name, topic: d.topic, unit: d.canonical_unit, value: v, previous: prev, change_pct: Math.round(((v - prev) / prev) * 1000) / 10, monthly, target_progress_pct: target };
      };
      return HttpResponse.json<KpiDashboard>({
        year,
        pending_count: state.values.filter((v) => v.status === "pending").length,
        frameworks: [
          { framework: "GRI", version: "GRI 2021+", percent: 82, gaps: 6, core: null },
          { framework: "BRSR", version: "BRSR 2023", percent: 74, gaps: 8, core: { done: 9, total: 9 } },
          { framework: "ESRS", version: "ESRS 2023", percent: 68, gaps: 9, core: null },
        ],
        cards: [
          card("GHG_SCOPE1", 4650.2, 4980.4, [520, 515, 509, 498, 530, 541, 522, 506, 512, null, null, null], 28.1),
          card("ENERGY_TOTAL", 37210, 39020, [4210, 4100, 4050, 3990, 4180, 4320, 4260, 3980, 4120, null, null, null], null),
          card("WATER_WITHDRAWAL", 31500, 33200, [3400, 3550, 3500, 3600, 3450, 3700, 3600, 3500, 3200, null, null, null], 64),
        ],
        gaps: [
          { kpi_definition_id: 14, kpi_name: "Water discharged", site_id: 3, site_name: "Matola", missing_periods: ["2026-07", "2026-08", "2026-09"], owner_user_id: 15, owner_name: "João Mendes" },
          { kpi_definition_id: 15, kpi_name: "Waste generated", site_id: 1, site_name: "Bahrain plant", missing_periods: ["2026-09"], owner_user_id: 11, owner_name: "Ravi Kumar" },
        ],
      });
    }),
  ),

  // KPI-11: framework reports
  http.get(
    "*/kpi/reports/:framework",
    gated(({ request, params }) => {
      const framework = String(params.framework).toUpperCase();
      if (!(FRAMEWORK_CODES as readonly string[]).includes(framework)) return notFound("Unknown framework.");
      const q = new URL(request.url).searchParams;
      const format = q.get("format") ?? "json";
      const year = Number(q.get("year") ?? 2026);
      if (format === "xlsx") return HttpResponse.arrayBuffer(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${framework}-${year}.xlsx"` } });
      if (format === "pdf") {
        if (framework !== "GRI") return badRequest("PDF is for the GRI content index only.");
        return HttpResponse.arrayBuffer(new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="GRI-${year}.pdf"` } });
      }
      return HttpResponse.json<KpiFrameworkReport>(report(framework as FrameworkCode, year));
    }),
  ),

  // KPI-12: AI assist (suggest only)
  http.post(
    "*/kpi/ai/suggest-values",
    gated(async ({ request }) => {
      const body = await json<{ document_id: number }>(request);
      if (!body.document_id) return badRequest("document_id is required.");
      return HttpResponse.json<SuggestValuesResult>({
        suggestions: [
          { kpi: "WATER_WITHDRAWAL", value: 1200, unit: "m³", period: "2026-09", source_page: 1, confidence: 0.92 },
          { kpi: "WATER_DISCHARGE", value: 860, unit: "m³", period: "2026-09", source_page: 2, confidence: 0.71 },
        ],
      });
    }),
  ),
  http.post(
    "*/kpi/ai/suggest-mapping",
    gated(async ({ request }) => {
      const body = await json<{ name: string; question?: string }>(request);
      if (!body.name?.trim()) return badRequest("name is required.");
      const words = `${body.name} ${body.question ?? ""}`.toLowerCase();
      const topic = ["water", "waste", "energy", "injur", "training"].find((w) => words.includes(w));
      const hits = topic ? state.disclosures.filter((d) => d.title.toLowerCase().includes(topic)).slice(0, 3) : [];
      return HttpResponse.json<SuggestMappingResult>({
        suggestions: hits.map((d, i) => ({
          disclosure_id: d.id,
          framework: (state.frameworks.find((f) => f.id === d.framework_id) as KpiFramework).code,
          code: d.code,
          fit: i === 0 ? "partial" : "derived",
          confidence: Math.round((0.8 - i * 0.15) * 100) / 100,
        })),
      });
    }),
  ),
];

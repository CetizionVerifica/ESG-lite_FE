import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import * as XLSX from "xlsx";
import {
  AUTO_SOURCE_KEYS,
  ESRS_TOPICS,
  FRAMEWORK_CODES,
  KPI_AGGREGATIONS,
  KPI_CHECK_IDS,
  KPI_FREQUENCIES,
  KPI_LEVELS,
  KPI_SOURCES,
  KPI_TOPICS,
  KPI_VALUE_STATUSES,
  KPI_VALUE_TYPES,
  MAPPING_FITS,
  MY_KPI_GROUPS,
  REQUIREMENT_LEVELS,
  UNIT_DIMENSIONS,
  YEAR_TYPES,
  isKpiErrorCode,
} from "../../lib/kpi/contracts";
import { handlers, resetKpiMocks, setKpiMockEnabled } from "./index";
import { setKpiAiAvailable } from "./kpi";
import { KPI_DEFINITIONS, KPI_DISCLOSURES, KPI_MAPPINGS } from "./kpi";

const server = setupServer(...handlers);
const API = "http://api.test";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetKpiMocks());
afterAll(() => server.close());

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const get = async <T = unknown>(path: string) => (await (await fetch(`${API}${path}`)).json()) as T;
/** A list the server wraps by name: `GET /kpi/library/definitions` answers `{definitions: [...]}`. */
const list = async <T = unknown>(path: string) => {
  const key = new URL(path, API).pathname.split("/").pop()!;
  return (await get<Record<string, T[]>>(path))[key];
};

// ---------------------------------------------------------------------------
// Runtime mirrors of the contract types: a key list per shape and the enum
// each enum field must hold. A wrong or missing field fails with its path.
// ---------------------------------------------------------------------------

type Spec = Record<string, "string" | "number" | "boolean" | "string?" | "number?" | "boolean?" | "object?" | "array" | "array?" | readonly string[] | { nullable: readonly string[] }>;

function check(row: unknown, spec: Spec, where: string) {
  expect(row, where).toBeTypeOf("object");
  const r = row as Record<string, unknown>;
  for (const [key, kind] of Object.entries(spec)) {
    const v = r[key];
    const at = `${where}.${key}`;
    expect(key in r, `${at} is missing`).toBe(true);
    if (Array.isArray(kind)) expect(kind, at).toContain(v);
    else if (typeof kind === "object" && "nullable" in kind) {
      if (v !== null) expect(kind.nullable, at).toContain(v);
    } else if (kind === "array") expect(Array.isArray(v), at).toBe(true);
    else if (kind === "array?") expect(v === null || Array.isArray(v), at).toBe(true);
    else if (kind === "object?") expect(v === null || typeof v === "object", at).toBe(true);
    else if ((kind as string).endsWith("?")) expect(v === null || typeof v === (kind as string).slice(0, -1), at).toBe(true);
    else expect(typeof v, at).toBe(kind as string);
  }
}

const DEFINITION: Spec = {
  id: "number", code: "string", name: "string", question: "string", help: "string?", topic: KPI_TOPICS, value_type: KPI_VALUE_TYPES,
  unit_dimension: UNIT_DIMENSIONS, canonical_unit: "string?", allowed_units: "array", aggregation: KPI_AGGREGATIONS, level: KPI_LEVELS,
  default_frequency: KPI_FREQUENCIES, source: KPI_SOURCES, auto_source: { nullable: AUTO_SOURCE_KEYS }, formula: "string?", breakdowns: "object?",
  decimals: "number", company_id: "number?", active: "boolean", created_at: "string",
};
const FRAMEWORK: Spec = { id: "number", code: FRAMEWORK_CODES, version: "string", name: "string", source_url: "string", active: "boolean", default_for_new: "boolean" };
const DISCLOSURE: Spec = { id: "number", framework_id: "number", code: "string", title: "string", section: "string", requirement: REQUIREMENT_LEVELS, esrs_topic: { nullable: ESRS_TOPICS }, source_url: "string", sort_key: "number" };
const MAPPING: Spec = { id: "number", disclosure_id: "number", kpi_definition_id: "number", fit: MAPPING_FITS, breakdown_key: "string?", display_unit: "string?", note: "string?" };
const VALUE: Spec = {
  id: "number", company_id: "number", site_id: "number?", kpi_definition_id: "number", period_start: "string", period_end: "string", frequency: KPI_FREQUENCIES,
  year_type: YEAR_TYPES, value_numeric: "number?", value_text: "string?", unit: "string?", value_canonical: "number?", breakdown: "object?", source: KPI_SOURCES,
  status: KPI_VALUE_STATUSES, is_estimate: "boolean", comment: "string?", entered_by: "number?", submitted_at: "string?", reviewed_by: "number?", reviewed_at: "string?",
  review_comment: "string?", checks: "array?", auto_snapshot: "object?", created_at: "string", updated_at: "string",
};
const MY_ITEM: Spec = {
  kpi_definition_id: "number", code: "string", name: "string", question: "string", help: "string?", topic: KPI_TOPICS, source: KPI_SOURCES, value_type: KPI_VALUE_TYPES,
  canonical_unit: "string?", allowed_units: "array", site_id: "number?", site_name: "string?", period_start: "string", period_end: "string", frequency: KPI_FREQUENCIES,
  due_date: "string", group: MY_KPI_GROUPS, value: "object?", last_value: "object?", used_in: "array",
};
const TARGET: Spec = {
  id: "number", company_id: "number", kpi_definition_id: "number", site_id: "number?", baseline_year: "number", baseline_value: "number", target_year: "number",
  target_value: "number", direction: ["reduce", "increase", "maintain"], note: "string?", created_by: "number", current_value: "number?", current_year: "number?", progress_pct: "number?",
};

const all = <T>(rows: T[], spec: Spec, where: string) => rows.forEach((r, i) => check(r, spec, `${where}[${i}]`));

describe("KPI sample data", () => {
  it("has 32 KPIs: 8 auto, 4 calculated, each code once, every auto/formula field set only for its source", () => {
    expect(KPI_DEFINITIONS.length).toBeGreaterThanOrEqual(30);
    expect(KPI_DEFINITIONS.filter((d) => d.source === "auto")).toHaveLength(8);
    expect(KPI_DEFINITIONS.filter((d) => d.source === "formula")).toHaveLength(4);
    expect(new Set(KPI_DEFINITIONS.map((d) => d.code)).size).toBe(KPI_DEFINITIONS.length);
    for (const d of KPI_DEFINITIONS) {
      expect(d.auto_source !== null, d.code).toBe(d.source === "auto");
      expect(d.formula !== null, d.code).toBe(d.source === "formula");
      if (d.canonical_unit && d.allowed_units.length) expect(d.allowed_units, d.code).toContain(d.canonical_unit);
    }
  });

  it("maps every KPI to an existing disclosure, and every disclosure has a source link", () => {
    const ids = new Set(KPI_DISCLOSURES.map((d) => d.id));
    for (const m of KPI_MAPPINGS) {
      expect(ids.has(m.disclosure_id)).toBe(true);
      expect(KPI_DEFINITIONS.some((d) => d.id === m.kpi_definition_id)).toBe(true);
      if (m.fit !== "exact") expect(m.note, `mapping ${m.id}`).toBeTruthy();
    }
    for (const d of KPI_DISCLOSURES) expect(d.source_url).toMatch(/^https:\/\//);
    for (const fw of FRAMEWORK_CODES) expect(KPI_DISCLOSURES.some((d) => d.section && d.framework_id === FRAMEWORK_CODES.indexOf(fw) + 1)).toBe(true);
  });

  it("only uses formula codes that exist", () => {
    const codes = new Set(KPI_DEFINITIONS.map((d) => d.code));
    for (const d of KPI_DEFINITIONS.filter((x) => x.formula)) for (const c of d.formula?.match(/[A-Z][A-Z0-9_]+/g) ?? []) expect(codes.has(c), `${d.code} → ${c}`).toBe(true);
  });
});

describe("KPI mock handlers: shapes match the contract types", () => {
  it("GET /kpi/status", async () => {
    check(await get("/kpi/status"), { enabled: "boolean", setup_completed: "boolean" }, "status");
  });

  it("GET /kpi/library/*", async () => {
    all(await list<unknown>("/kpi/library/definitions"), DEFINITION, "definitions");
    all(await list<unknown>("/kpi/library/frameworks"), FRAMEWORK, "frameworks");
    all(await list<unknown>("/kpi/library/disclosures"), DISCLOSURE, "disclosures");
    all(await list<unknown>("/kpi/library/mappings"), MAPPING, "mappings");
  });

  it("filters the library by framework (id or code), topic and source", async () => {
    const esrs = await list<{ framework_id: number }>("/kpi/library/disclosures?framework=ESRS");
    expect(esrs.length).toBeGreaterThan(0);
    expect(new Set(esrs.map((d) => d.framework_id))).toEqual(new Set([3]));
    expect(await list("/kpi/library/disclosures?framework=3")).toEqual(esrs);
    const water = await list<{ topic: string }>("/kpi/library/definitions?topic=water");
    expect(water.every((d) => d.topic === "water")).toBe(true);
    expect(await list<unknown>("/kpi/library/definitions?source=auto")).toHaveLength(8);
  });

  it("GET /kpi/catalogue", async () => {
    const c = await get<{ frameworks: unknown[]; disclosures: unknown[]; definitions: unknown[]; mappings: unknown[] }>("/kpi/catalogue");
    all(c.frameworks, FRAMEWORK, "catalogue.frameworks");
    all(c.disclosures, DISCLOSURE, "catalogue.disclosures");
    all(c.definitions, DEFINITION, "catalogue.definitions");
    all(c.mappings, MAPPING, "catalogue.mappings");
  });

  it("GET /kpi/setup", async () => {
    const s = await get<{ settings: unknown; frameworks: unknown[]; material_topics: unknown[]; kpis: unknown[]; assignments: unknown[] }>("/kpi/setup");
    check(s.settings, { company_id: "number", year_type: YEAR_TYPES, first_year: "number", due_day: "number", setup_completed_at: "string?" }, "settings");
    all(s.frameworks, { company_id: "number", framework_id: "number", enabled_at: "string", enabled_by: "number" }, "frameworks");
    all(s.material_topics, { company_id: "number", esrs_topic: ESRS_TOPICS, material: "boolean", reason: "string?", decided_by: "number?", decided_at: "string?" }, "material_topics");
    all(s.kpis, { company_id: "number", kpi_definition_id: "number", selected: "boolean", frequency: { nullable: KPI_FREQUENCIES }, reason_excluded: "string?" }, "kpis");
    all(s.assignments, { company_id: "number", kpi_definition_id: "number", site_id: "number?", owner_user_id: "number", reviewer_user_id: "number?" }, "assignments");
    for (const t of s.material_topics as { material: boolean; reason: string | null }[]) if (!t.material) expect(t.reason).toBeTruthy();
  });

  it("GET /kpi/my: September has 4 due, 1 sent back and 8 done (7 plus the calculated water consumed)", async () => {
    const my = await get<{ period: string; items: { group: string; value: unknown }[]; counts: Record<string, number> }>("/kpi/my?period=2026-09");
    expect(my.period).toBe("2026-09");
    all(my.items, MY_ITEM, "my.items");
    for (const i of my.items) if (i.value) check(i.value, VALUE, "my.items.value");
    expect(my.counts).toEqual({ due: 4, sent_back: 1, done: 8, total: 13 });
    expect(my.items.filter((i) => i.group === "due")).toHaveLength(4);
  });

  it("GET /kpi/values, /kpi/targets", async () => {
    all(await list<unknown>("/kpi/values"), VALUE, "values");
    const pending = await list<{ status: string }>("/kpi/values?status=pending");
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((v) => v.status === "pending")).toBe(true);
    const held = (await list<{ checks: { id: string }[] | null }>("/kpi/values")).flatMap((v) => v.checks ?? []);
    for (const c of held) expect(KPI_CHECK_IDS).toContain(c.id);
    all(await list<unknown>("/kpi/targets"), TARGET, "targets");
  });

  it("GET /kpi/periods/lock, /kpi/dashboard and /kpi/reports/:framework", async () => {
    const lock = await get<{ year: number; sites: unknown[]; left: unknown[] }>("/kpi/periods/lock?year=2026&period=9");
    all(lock.sites, { site_id: "number?", name: "string", locked: "boolean", lock: "object?", kpis: "array" }, "lock.sites");
    all(lock.left, { site_id: "number?", site_name: "string?", kpi_definition_id: "number", kpi_name: "string", reason: ["missing", "draft", "pending", "rejected"] }, "lock.left");
    const dash = await get<{ coverage: unknown[]; cards: unknown[]; gaps: unknown[]; pending_not_in: unknown }>("/kpi/dashboard?year=2026");
    all(dash.coverage, { framework: FRAMEWORK_CODES, version: "string?", required: "number", approved: "number", pending: "number", missing: "number", percent: "number", core: "object?" }, "dashboard.coverage");
    all(dash.cards, { kpi_definition_id: "number", code: "string", name: "string", topic: KPI_TOPICS, unit: "string?", value: "number?", previous: "number?", change_pct: "number?", series: "array", target: "object?" }, "dashboard.cards");
    all(dash.gaps, { kpi_definition_id: "number", kpi_name: "string", site_id: "number?", site_name: "string?", periods_missing: "array", owner_name: "string?", frameworks: "array" }, "dashboard.gaps");
    check(dash.pending_not_in, { count: "number" }, "dashboard.pending_not_in");
    for (const fw of FRAMEWORK_CODES) {
      const r = await get<{ framework: string; rows: unknown[]; omissions: unknown[] }>(`/kpi/reports/${fw}?year=2026`);
      expect(r.framework).toBe(fw);
      all(r.rows, { disclosure_id: "number", code: "string", title: "string", section: "string", unit: "string?", notes: "string?", value_ids: "array", kpi_definition_ids: "array" }, `report.${fw}.rows`);
      all(r.omissions, { disclosure_id: "number?", code: "string", title: "string", reason: "string", kind: ["not_material", "excluded", "missing", "not_tracked"] }, `report.${fw}.omissions`);
    }
    const xlsx = await fetch(`${API}/kpi/reports/BRSR?year=2026&format=xlsx`);
    expect(xlsx.headers.get("content-type")).toContain("spreadsheetml");
    expect((await fetch(`${API}/kpi/reports/XYZ`)).status).toBe(404);
  });

  it("POST /kpi/auto/refresh and /kpi/ai/*", async () => {
    const auto = (await (await send("POST", "/kpi/auto/refresh?year=2026")).json()) as { refreshed: number; unchanged: number; removed: number; locked: number; values: unknown[]; formulas: unknown[] };
    expect(auto.refreshed).toBeGreaterThan(0);
    expect(auto).toMatchObject({ unchanged: 0, removed: 0, locked: 0, formulas: [] });
    all(auto.values, VALUE, "auto.values");
    const sv = (await (await send("POST", "/kpi/ai/suggest-values", { document_id: 7, period: "2026-09" })).json()) as { document_name: string; suggestions: unknown[] };
    expect(sv.document_name).toBe("document-7.pdf");
    all(sv.suggestions, { kpi_code: "string", value: "number", unit: "string", period_start: "string", source_page: "number?", quote: "string?", confidence: "number", why: "string?" }, "suggest-values");
    const sm = (await (await send("POST", "/kpi/ai/suggest-mapping", { name: "Rainwater harvested" })).json()) as { suggestions: unknown[] };
    all(sm.suggestions, { framework: FRAMEWORK_CODES, code: "string", title: "string", why: "string", confidence: "number" }, "suggest-mapping");
    setKpiAiAvailable(false);
    expect(await (await send("POST", "/kpi/ai/suggest-values", { document_id: 7 })).json()).toEqual({ available: false, message: expect.any(String) });
  });
});

describe("KPI mock handlers: behaviour", () => {
  it("answers KPI_TRACKING_OFF everywhere but status and the library when the switch is off", async () => {
    setKpiMockEnabled(false);
    expect(await get("/kpi/status")).toEqual({ enabled: false, setup_completed: false });
    expect((await fetch(`${API}/kpi/library/definitions`)).status).toBe(200);
    for (const [method, path] of [
      ["GET", "/kpi/catalogue"], ["GET", "/kpi/setup"], ["PUT", "/kpi/setup"], ["POST", "/kpi/setup/custom-kpis"], ["GET", "/kpi/my"], ["GET", "/kpi/values"],
      ["PUT", "/kpi/values"], ["POST", "/kpi/values/submit"], ["POST", "/kpi/values/1/evidence"], ["DELETE", "/kpi/values/1/evidence/1"], ["PUT", "/kpi/values/approve"],
      ["PUT", "/kpi/values/reject"], ["GET", "/kpi/periods/lock?year=2026"], ["POST", "/kpi/periods/lock"], ["POST", "/kpi/periods/unlock"], ["POST", "/kpi/auto/refresh"],
      ["GET", "/kpi/targets"], ["PUT", "/kpi/targets"], ["DELETE", "/kpi/targets/1"], ["GET", "/kpi/dashboard"], ["GET", "/kpi/reports/GRI"],
      ["POST", "/kpi/ai/suggest-values"], ["POST", "/kpi/ai/suggest-mapping"],
    ]) {
      const res = await send(method, path, method === "GET" || method === "DELETE" ? undefined : {});
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(((await res.json()) as { code: string }).code, `${method} ${path}`).toBe("KPI_TRACKING_OFF");
    }
  });

  it("saves a draft, refuses auto values and wrong units, then submits it", async () => {
    const put = await send("PUT", "/kpi/values", {
      items: [
        { kpi_definition_id: 15, site_id: 1, period_start: "2026-09-01", frequency: "monthly", value_numeric: 11.9, unit: "t" },
        { kpi_definition_id: 1, site_id: 1, period_start: "2026-09-01", frequency: "monthly", value_numeric: 1 },
        { kpi_definition_id: 14, site_id: 1, period_start: "2026-09-01", frequency: "monthly", value_numeric: 1, unit: "gallons" },
      ],
    });
    const { results } = (await put.json()) as { results: { ok: boolean; code?: string; value?: { id: number; status: string } }[] };
    expect(results.map((r) => (r.ok ? "ok" : r.code))).toEqual(["ok", "KPI_AUTO_READ_ONLY", "KPI_UNIT_NOT_ALLOWED"]);
    for (const r of results) if (!r.ok) expect(isKpiErrorCode(r.code)).toBe(true);
    const id = results[0].value!.id;
    // Waste generated is BRSR Core: no evidence, no submit.
    let sub = (await (await send("POST", "/kpi/values/submit", { ids: [id, 3] })).json()) as { submitted: number[]; refused: { id: number; code: string }[] };
    expect(sub).toEqual({ submitted: [], refused: [{ id, code: "KPI_EVIDENCE_REQUIRED" }, { id: 3, code: "KPI_NOT_DRAFT" }] });
    expect((await send("POST", `/kpi/values/${id}/evidence`)).status).toBe(201);
    sub = (await (await send("POST", "/kpi/values/submit", { ids: [id] })).json()) as typeof sub;
    expect(sub.submitted).toEqual([id]);
    const my = await get<{ counts: Record<string, number> }>("/kpi/my?period=2026-09");
    expect(my.counts).toMatchObject({ due: 3, done: 9 });
  });

  it("approves only ready values, needs a reason to reject, and won't lock an incomplete month", async () => {
    const approve = (await (await send("PUT", "/kpi/values/approve", { ids: [10, 11], only_ready: true })).json()) as { updated: number[]; refused: { id: number }[] };
    expect(approve.updated).toEqual([11]);
    expect(approve.refused.map((r) => r.id)).toEqual([10]);
    expect(((await (await send("PUT", "/kpi/values/reject", { ids: [10] })).json()) as { code: string }).code).toBe("KPI_REASON_REQUIRED");
    const lock = await send("POST", "/kpi/periods/lock", { year: 2026, period: 9, site_id: 1 });
    expect(lock.status).toBe(422);
    const body = (await lock.json()) as { code: string; details: { left: unknown[] } };
    expect(body.code).toBe("KPI_PERIOD_INCOMPLETE");
    expect(body.details.left.length).toBeGreaterThan(0);
  });

  it("locks a complete month, reopens it with a reason, and lets a reviewer edit a pending value with a reason", async () => {
    const status = await get<{ left: unknown[] }>("/kpi/periods/lock?year=2026&period=8");
    expect(status.left).toEqual([]);
    expect((await send("POST", "/kpi/periods/lock", { year: 2026, period: 8, site_id: 2 })).status).toBe(200);
    const after = await get<{ sites: { site_id: number; locked: boolean }[] }>("/kpi/periods/lock?year=2026&period=8");
    expect(after.sites.find((s) => s.site_id === 2)?.locked).toBe(true);
    expect(((await (await send("POST", "/kpi/periods/unlock", { year: 2026, period: 8, site_id: 2 })).json()) as { code: string }).code).toBe("KPI_REASON_REQUIRED");
    expect((await send("POST", "/kpi/periods/unlock", { year: 2026, period: 8, site_id: 2, reason: "Meter reading corrected" })).status).toBe(200);

    const item = { id: 10, kpi_definition_id: 13, site_id: 2, period_start: "2026-09-01", frequency: "monthly", value_numeric: 1200, unit: "m³" };
    const noReason = (await (await send("PUT", "/kpi/values", { items: [item] })).json()) as { results: { ok: boolean; code?: string }[] };
    expect(noReason.results[0]).toMatchObject({ ok: false, code: "KPI_REASON_REQUIRED" });
    const edited = (await (await send("PUT", "/kpi/values", { items: [{ ...item, reason: "Typo: 3,600 was the quarter" }] })).json()) as { results: { ok: boolean; value: { status: string; value_numeric: number } }[] };
    expect(edited.results[0].value).toMatchObject({ status: "pending", value_numeric: 1200 });
  });

  it("reminds an owner once a day and filters the dashboard's gaps by framework", async () => {
    const first = (await (await send("POST", "/kpi/dashboard/remind", { kpi: 14, site: 3 })).json()) as { reminded: boolean; owner_name: string };
    expect(first).toMatchObject({ reminded: true, owner_name: "João Mendes" });
    expect(((await (await send("POST", "/kpi/dashboard/remind", { kpi: 14, site: 3 })).json()) as { reminded: boolean }).reminded).toBe(false);
    const all = await get<{ gaps: unknown[] }>("/kpi/dashboard?year=2026");
    const brsr = await get<{ gaps: { frameworks: string[] }[] }>("/kpi/dashboard?year=2026&framework=BRSR");
    expect(brsr.gaps.length).toBeLessThan(all.gaps.length);
    expect(brsr.gaps.every((g) => g.frameworks.includes("BRSR"))).toBe(true);
  });

  it("validates library writes: duplicate codes and unknown formula codes", async () => {
    const base = { ...KPI_DEFINITIONS[20], code: "NEW_KPI" };
    const dup = await send("POST", "/kpi/library/definitions", { ...base, code: "REVENUE" });
    expect(((await dup.json()) as { code: string }).code).toBe("KPI_CODE_TAKEN");
    const bad = await send("POST", "/kpi/library/definitions", { ...base, source: "formula", formula: "NOPE / REVENUE" });
    expect(((await bad.json()) as { code: string }).code).toBe("KPI_FORMULA_INVALID");
    const ok = await send("POST", "/kpi/library/definitions", base);
    expect(ok.status).toBe(201);
    const edited = await send("PUT", `/kpi/library/definitions/21`, { question: "What did the company earn in {period}?" });
    expect(((await edited.json()) as { definition: { question: string } }).definition.question).toBe("What did the company earn in {period}?");
  });

  it("keeps targets and setup reasons", async () => {
    const created = await send("PUT", "/kpi/targets", { kpi_definition_id: 5, baseline_year: 2024, baseline_value: 50000, target_year: 2030, target_value: 40000, direction: "reduce" });
    expect(created.status).toBe(201);
    const target = ((await created.json()) as { target: { id: number; status: string; kpi_name: string; progress_pct: number | null } }).target;
    expect(target).toMatchObject({ id: 3, kpi_name: "Energy consumed" });
    expect(["on_track", "behind"]).toContain(target.status);
    expect(await list<unknown>("/kpi/targets")).toHaveLength(3);
    const wrongWay = await send("PUT", "/kpi/targets", { kpi_definition_id: 5, baseline_year: 2024, baseline_value: 50000, target_year: 2030, target_value: 60000, direction: "reduce" });
    expect(((await wrongWay.json()) as { code: string }).code).toBe("KPI_VALIDATION");
    expect((await send("DELETE", "/kpi/targets/3")).status).toBe(200);
    expect(await list<unknown>("/kpi/targets")).toHaveLength(2);
    const noReason = await send("PUT", "/kpi/setup", { material_topics: [{ esrs_topic: "E4", material: false, reason: "" }] });
    expect(((await noReason.json()) as { code: string }).code).toBe("KPI_REASON_REQUIRED");
  });

  it("D17: My KPIs follow topic owners and exceptions; a person's topics move with a note", async () => {
    type My = { items: { code: string; topic: string; topic_label: string }[] };
    const before = (await get<My>("/kpi/my?period=2026-09")).items;
    expect(before.map((i) => i.code)).toContain("WATER_DISCHARGE");
    expect(before.find((i) => i.code === "WATER_DISCHARGE")?.topic_label).toBe("Water");
    const setup = await get<{ topic_assignments: { site_id: number | null; topic: string; owner_user_id: number }[]; suggested_topic_assignments: unknown[]; topics_in_use: { topic: string; kpi_count: number }[] }>("/kpi/setup");
    expect(setup.topics_in_use[0]).toEqual({ topic: "climate", kpi_count: 4 });
    expect(setup.suggested_topic_assignments.length).toBeGreaterThan(0);
    // Water at Bahrain plant to Mia: Ravi no longer owes it.
    const rows = setup.topic_assignments.map((t) => (t.site_id === 1 && t.topic === "water" ? { ...t, owner_user_id: 12 } : t));
    expect((await send("PUT", "/kpi/setup", { topic_assignments: rows })).status).toBe(200);
    expect((await get<My>("/kpi/my?period=2026-09")).items.map((i) => i.code)).not.toContain("WATER_DISCHARGE");
    // Ravi takes water back through the users drawer.
    const moved = (await (await send("PUT", "/kpi/people/11/topics", { topics: ["water", "waste"] })).json()) as { topics: string[]; site_ids: number[]; moved: { topic: string; site_name: string; from_name: string }[] };
    expect(moved).toMatchObject({ topics: ["water", "waste"], site_ids: [1] });
    expect(moved.moved).toEqual([expect.objectContaining({ topic: "water", site_name: "Bahrain plant", from_name: "Mia Haddad" })]);
    expect((await get<{ topics: string[] }>("/kpi/people/11/topics")).topics).toEqual(["water", "waste"]);
  });

  it("GET /kpi/overview: readiness per framework and the month's counts (KPI-10 wave D)", async () => {
    const o = await get<{ readiness: { framework: string; percent: number }[]; due: { due: number; sent_back: number; done: number }; period: string }>("/kpi/overview");
    expect(o.readiness.map((r) => `${r.framework} ${r.percent}`)).toEqual(["GRI 82", "BRSR 74", "ESRS 68"]);
    expect(o.due).toEqual({ due: 4, sent_back: 1, done: 3 });
    expect(o.period).toBe("2026-09");
  });

  it("KPI-7 part 3: the template lists only what's to enter, plans a filled copy with issues, and commits drafts", async () => {
    const res = await fetch(`${API}/kpi/my/template?period=2026-09`);
    expect(res.headers.get("content-disposition")).toContain("my-kpis-2026-09.xlsx");
    const book = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: "array" });
    const lines = XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0]], { header: 1 });
    expect(lines[0]).toEqual(["KPI code", "KPI", "Site", "Period start", "Unit", "Value", "Comment"]);
    const codes = lines.slice(1).map((l) => l[0]);
    expect(codes).toContain("WASTE_GENERATED");
    expect(codes).not.toContain("FATALITIES");
    const fill = [lines[0], ["WASTE_GENERATED", "", "Bahrain plant", "2026-09-01", "t", "11", ""], ["AIR_NOX", "", "Bahrain plant", "2026-07-01", "kg", "1700", ""], ["FATALITIES", "", "Bahrain plant", "2026-09-01", "", "0", ""]];
    const out = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(fill), "My KPIs");
    const form = new FormData();
    form.append("file", new Blob([XLSX.write(out, { type: "array", bookType: "xlsx" }) as ArrayBuffer]), "filled.xlsx");
    form.append("period", "2026-09");
    const plan = ((await (await fetch(`${API}/kpi/my/template`, { method: "POST", body: form })).json()) as { plan: { plan_id: string; rows: { kpi_code: string; issue: { code: string } | null }[]; counts: { ready: number; issues: number } } }).plan;
    expect(plan.counts).toEqual({ ready: 2, issues: 1 });
    expect(plan.rows.find((r) => r.kpi_code === "FATALITIES")?.issue?.code).toBe("KPI_NOT_ASSIGNED");
    const commit = (await (await send("POST", "/kpi/my/template", { plan_id: plan.plan_id, commit: true })).json()) as { saved: number };
    expect(commit.saved).toBe(2);
    const waste = (await get<{ items: { code: string; value: { status: string; value_numeric: number } | null }[] }>("/kpi/my?period=2026-09")).items.find((i) => i.code === "WASTE_GENERATED");
    expect(waste?.value).toMatchObject({ status: "draft", value_numeric: 11 });
  });
});

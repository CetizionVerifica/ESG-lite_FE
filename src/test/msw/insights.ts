/**
 * Mock handlers for every Insights endpoint of docs/insights/01-contracts.md §4
 * (IN-0), so each lane builds and tests its panels before its backend lands.
 * Fixture data: src/test/msw/insightsData.ts (three plants, 2021–2026).
 *
 * Use in a test:
 *   const server = setupServer(...insightsHandlers);   // from "msw/node", or `handlers` from ./index
 *   beforeEach(() => resetInsightsMocks());
 *
 * Variants:
 *   setInsightsMockEnabled(false)  the company's switch is off: every route but
 *                                  `/insights/status` answers 403 `IN_OFF`.
 *   setInsightsMockKpi(false)      KPI tracking is off: `esg-ring` and `materiality`
 *                                  answer `availability: 'kpi_off'`, the summary has no
 *                                  readiness, the wall is SBTi only, the flow has no
 *                                  disclosure column.
 *   setInsightsMockRole("User")    the caller is a contributor: 403 `IN_FORBIDDEN`.
 *   setInsightsMockPanel(id, …)    one panel answers `no_data` / `setup_incomplete`
 *                                  (with a reason) or fails with a 500.
 *   GET /insights/cards?ai=1      IN-9: the same cards, some with `source: 'ai'` and
 *                                  token `text` (one deliberately invalid).
 * Events are stateful (create, rename, delete, read back). Each module keeps
 * its handlers in step with its contract.
 */
import { http, HttpResponse } from "msw";
import {
  IN_ERROR_STATUS,
  KPI_PANELS,
  PANEL_PATHS,
  PILLARS,
  type EventCreate,
  type EventRef,
  type InErrorBody,
  type InErrorCode,
  type InsightsSites,
  type InsightsStatus,
  type PanelDataMap,
  type PanelId,
  type PanelResponse,
  type Pillar,
  type SiteFilter,
  type YearType,
} from "../../lib/insights/contracts";
import {
  MOCK_EVENTS,
  MOCK_SITES,
  aiCardsData,
  bridgeData,
  cardsData,
  completenessData,
  decouplingData,
  esgRingData,
  flowData,
  materialityData,
  pathwayData,
  stripesData,
  summaryData,
  targetWallData,
} from "./insightsData";

type PanelOverride = { availability: "no_data" | "setup_incomplete"; reason: string } | { error: 500 };

interface State {
  enabled: boolean;
  kpi: boolean;
  role: "Manager" | "Admin" | "Superadmin" | "User";
  events: EventRef[];
  nextEventId: number;
  panels: Partial<Record<PanelId, PanelOverride>>;
  /** Materiality scores entered (IN-7); false → topics listed without positions. */
  scored: boolean;
}

const initialState = (): State => ({ enabled: true, kpi: true, role: "Manager", events: MOCK_EVENTS.map((e) => ({ ...e })), nextEventId: MOCK_EVENTS.length + 1, panels: {}, scored: true });
let state = initialState();

export function resetInsightsMocks(): void {
  state = initialState();
}
/** The company's `insights_enabled`. */
export function setInsightsMockEnabled(enabled: boolean): void {
  state.enabled = enabled;
}
/** The company's `kpi_tracking_enabled`. */
export function setInsightsMockKpi(enabled: boolean): void {
  state.kpi = enabled;
}
/** Who calls: a User gets `IN_FORBIDDEN` behind the switch. */
export function setInsightsMockRole(role: State["role"]): void {
  state.role = role;
}
/** One panel answers an empty state or fails; `null` restores it. */
export function setInsightsMockPanel(panel: PanelId, override: PanelOverride | null): void {
  if (override) state.panels[panel] = override;
  else delete state.panels[panel]; // data-loss-reviewed: mock state, not a record
}
/** Materiality without scores (the topic list and "Add scores"). */
export function setInsightsMockScored(scored: boolean): void {
  state.scored = scored;
}
/** The stored events (tests read back what a handler saved). */
export function insightsMockEvents(): EventRef[] {
  return state.events.map((e) => ({ ...e }));
}

const MESSAGES: Record<InErrorCode, string> = {
  IN_OFF: "Insights isn't turned on for your company.",
  IN_FORBIDDEN: "Your role can't open Insights.",
  IN_SITE_NOT_FOUND: "Not found.",
  IN_EVENT_NOT_FOUND: "That event wasn't found.",
  IN_EVENT_INVALID: "The event isn't valid.",
  IN_SCORES_INVALID: "Scores must be between 0 and 10 for a material topic.",
  IN_AI_BUDGET: "This month's AI wording budget is used up; cards show their standard text.",
  IN_SNAPSHOT_TIMEOUT: "The PDF snapshot took too long. Try again with fewer sites.",
  IN_VALIDATION: "The request isn't valid.",
  IN_COMPANY_REQUIRED: "Choose a client (company_id).",
};
const fail = (code: InErrorCode, details?: unknown): Response =>
  HttpResponse.json<InErrorBody>(details === undefined ? { code, message: MESSAGES[code] } : { code, message: MESSAGES[code], details }, { status: IN_ERROR_STATUS[code] });

/** The switch, then the role (as requireInsights). */
const gate = (): Response | null => {
  if (!state.enabled) return fail("IN_OFF");
  if (state.role === "User") return fail("IN_FORBIDDEN");
  return null;
};

interface Query {
  year: number;
  yearType: YearType;
  sites: SiteFilter;
  pillar: Pillar | null;
}
/** The common query, as the server's InsightsQuerySchema reads it; a bad one is IN_VALIDATION, a foreign site IN_SITE_NOT_FOUND. */
function readQuery(request: Request): Query | Response {
  const p = new URL(request.url).searchParams;
  const yearRaw = p.get("year");
  const year = yearRaw ? Number(yearRaw) : new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return fail("IN_VALIDATION", { issues: [{ path: "year", message: "Invalid year" }] });
  const yt = p.get("yearType") || "CY";
  if (yt !== "CY" && yt !== "FY") return fail("IN_VALIDATION", { issues: [{ path: "yearType", message: "Invalid option" }] });
  const sitesRaw = p.get("sites") || "all";
  let sites: SiteFilter = "all";
  if (sitesRaw !== "all") {
    if (!/^\d+(,\d+)*$/.test(sitesRaw)) return fail("IN_VALIDATION", { issues: [{ path: "sites", message: "sites must be 'all' or a comma-separated list of site ids" }] });
    sites = [...new Set(sitesRaw.split(",").map(Number))].sort((a, b) => a - b);
    if (sites.some((id) => !MOCK_SITES.some((s) => s.site_id === id))) return fail("IN_SITE_NOT_FOUND");
  }
  const pillarRaw = p.get("pillar") || null;
  if (pillarRaw && !(PILLARS as readonly string[]).includes(pillarRaw)) return fail("IN_VALIDATION", { issues: [{ path: "pillar", message: "Invalid option" }] });
  return { year, yearType: yt, sites, pillar: pillarRaw as Pillar | null };
}

const siteLabel = (sites: SiteFilter) => (sites === "all" ? "All sites" : sites.length === 1 ? (MOCK_SITES.find((s) => s.site_id === sites[0])?.name ?? "1 site") : `${sites.length} sites`);

function dataFor<P extends PanelId>(panel: P, request: Request): PanelDataMap[P] {
  const kpi = state.kpi;
  const ai = new URL(request.url).searchParams.get("ai") === "1";
  const data: { [K in PanelId]: () => PanelDataMap[K] } = {
    summary: () => summaryData(kpi),
    esg_ring: () => esgRingData,
    decoupling: () => decouplingData,
    target_wall: () => targetWallData(kpi),
    cards: () => (ai ? aiCardsData(kpi) : cardsData(kpi)), // IN-9: ?ai=1 rewords some cards
    pathway: () => pathwayData(state.events),
    completeness: () => completenessData,
    bridge: () => bridgeData,
    flow: () => flowData(kpi),
    materiality: () => materialityData(state.scored),
    stripes: () => stripesData,
  };
  return data[panel]() as PanelDataMap[P];
}

function panelResponse(panel: PanelId, request: Request): Response {
  const blocked = gate();
  if (blocked) return blocked;
  const q = readQuery(request);
  if (q instanceof Response) return q;
  const override = state.panels[panel];
  if (override && "error" in override) return HttpResponse.json({ message: "Internal server error" }, { status: 500 });
  const base = {
    panel,
    period: { year: q.year, yearType: q.yearType },
    sites: q.sites,
    label: `${q.yearType} ${q.year} · ${siteLabel(q.sites)}`,
    pending_not_in: { emissions: 12, kpi_values: state.kpi ? 3 : 0, link: "/data/approvals" },
    stamp: `mock-${q.year}-${state.events.length}`,
    links: {} as Record<string, string>,
  };
  if ((KPI_PANELS as readonly string[]).includes(panel) && !state.kpi) {
    return HttpResponse.json<PanelResponse<null>>({ ...base, availability: "kpi_off", data: null });
  }
  if (override) return HttpResponse.json<PanelResponse<null>>({ ...base, availability: override.availability, reason: override.reason, data: null });
  const links: Record<string, string> =
    panel === "summary"
      ? { net: "/data/ledger?status=approved", intensity: "/data/production", readiness: "/kpi/esg", attention: "/data/approvals" }
      : panel === "target_wall"
        ? Object.fromEntries(targetWallData(state.kpi).items.map((i) => [i.id, i.link]))
        : {};
  return HttpResponse.json<PanelResponse<PanelDataMap[typeof panel]>>({ ...base, availability: "ok", data: dataFor(panel, request), links });
}

const LABEL_MAX = 60;
const EVENT_KINDS = ["initiative", "acquisition", "divestment", "method_change", "disruption", "other"];
const validEvent = (b: Partial<EventCreate>, partial: boolean): string | null => {
  if (!partial || b.date !== undefined) if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return "date";
  if (!partial || b.label !== undefined) if (typeof b.label !== "string" || !b.label.trim() || b.label.trim().length > LABEL_MAX) return "label";
  if (!partial || b.kind !== undefined) if (!EVENT_KINDS.includes(String(b.kind))) return "kind";
  if (b.site_id !== undefined && b.site_id !== null && !MOCK_SITES.some((s) => s.site_id === b.site_id)) return "site_id";
  return null;
};

export const insightsHandlers = [
  http.get("*/insights/status", () => HttpResponse.json<InsightsStatus>({ enabled: state.enabled, kpi_tracking: state.kpi })),
  http.get("*/insights/sites", () => gate() ?? HttpResponse.json<InsightsSites>({ sites: MOCK_SITES })),

  // One GET per panel (01-contracts §4).
  ...(Object.entries(PANEL_PATHS) as [PanelId, string][]).map(([panel, path]) => http.get(`*/insights${path}`, ({ request }) => panelResponse(panel, request))),

  // IN-4 · events
  http.get("*/insights/events", ({ request }) => {
    const blocked = gate();
    if (blocked) return blocked;
    const p = new URL(request.url).searchParams;
    const from = p.get("from");
    const to = p.get("to");
    return HttpResponse.json<{ events: EventRef[] }>({ events: state.events.filter((e) => (!from || e.date >= from) && (!to || e.date <= to)) });
  }),
  http.post("*/insights/events", async ({ request }) => {
    const blocked = gate();
    if (blocked) return blocked;
    const body = (await request.json().catch(() => ({}))) as Partial<EventCreate>;
    const bad = validEvent(body, false);
    if (bad) return fail("IN_EVENT_INVALID", { issues: [{ path: bad, message: "Invalid" }] });
    const event: EventRef = { id: state.nextEventId++, date: body.date!, label: body.label!.trim(), kind: body.kind!, site_id: body.site_id ?? null };
    state.events.push(event);
    return HttpResponse.json(event, { status: 201 });
  }),
  http.patch("*/insights/events/:id", async ({ params, request }) => {
    const blocked = gate();
    if (blocked) return blocked;
    const event = state.events.find((e) => e.id === Number(params.id));
    if (!event) return fail("IN_EVENT_NOT_FOUND");
    const body = (await request.json().catch(() => ({}))) as Partial<EventCreate>;
    const bad = validEvent(body, true) ?? (Object.keys(body).filter((k) => k !== "company_id").length === 0 ? "body" : null);
    if (bad) return fail("IN_EVENT_INVALID", { issues: [{ path: bad, message: "Invalid" }] });
    Object.assign(event, { ...body, ...(body.label ? { label: body.label.trim() } : {}) });
    return HttpResponse.json(event);
  }),
  // data-loss-reviewed: MSW mock for tests and dev only; removes the event from in-memory mock state, never real data.
  http.delete("*/insights/events/:id", ({ params }) => {
    const blocked = gate();
    if (blocked) return blocked;
    const before = state.events.length;
    state.events = state.events.filter((e) => e.id !== Number(params.id));
    if (state.events.length === before) return fail("IN_EVENT_NOT_FOUND");
    return new HttpResponse(null, { status: 204 });
  }),

  // IN-7 · materiality scores (shared with RS-2 / DS-2)
  http.put("*/kpi/setup/materiality-scores", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { topics?: { esrs_topic?: string; impact_score?: number | null; financial_score?: number | null }[] };
    const ok = Array.isArray(body.topics) && body.topics.length > 0 && body.topics.every((t) => !!t.esrs_topic && [t.impact_score, t.financial_score].every((v) => v === null || (typeof v === "number" && v >= 0 && v <= 10)));
    if (!ok) return fail("IN_SCORES_INVALID");
    state.scored = true;
    return HttpResponse.json({ topics: body.topics });
  }),

  // IN-8 · the PDF snapshot (a tiny placeholder PDF)
  http.get("*/insights/snapshot.pdf", ({ request }) => {
    const blocked = gate();
    if (blocked) return blocked;
    const q = readQuery(request);
    if (q instanceof Response) return q;
    return new HttpResponse("%PDF-1.4\n% insights mock snapshot\n%%EOF\n", { headers: { "content-type": "application/pdf" } });
  }),
];

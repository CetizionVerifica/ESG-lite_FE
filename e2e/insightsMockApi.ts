import type { Page } from "@playwright/test";
import {
  MOCK_EVENTS,
  MOCK_SITES,
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
} from "../src/test/msw/insightsData";

/**
 * In-memory API for Insights Playwright specs (IN-0, widened for IN-1…IN-10):
 * `/admin/companies` for the Superadmin, `/insights/status` (following the
 * stored switch), every `/insights` panel from the MSW fixture
 * (src/test/msw/insightsData.ts), stateful events, and enough of the rest of
 * the app for the shell. Writes are recorded so tests check what reached the server.
 */

export type Call = { method: string; path: string; body: unknown };
export type PanelOverride = { availability: "no_data" | "setup_incomplete"; reason: string } | { error: number };
export type Opts = {
  companies?: Record<string, unknown>[];
  insights?: boolean;
  kpi?: boolean;
  serverOff?: boolean;
  /** Panel path (e.g. "pathway", "esg-ring") → an empty state or an error. */
  panels?: Record<string, PanelOverride>;
  /** Materiality scored (default true). */
  scored?: boolean;
  /** Cards with AI text when `?ai=1` (IN-9). */
  aiCards?: (kpi: boolean) => unknown;
  /** The company's brand pack (`/brands/mine`); none = PlanetPulse. */
  brand?: object | null;
  /** The account's saved appearance. */
  appearance?: "light" | "dark";
};

/** The app's own port (assets); everything else is the API. E2E_PORT lets a lane run on its own dev server. */
const APP_PORT = process.env.E2E_PORT ?? "4173";

export const ACME = { company_id: 1, name: "ACME", status: true, kpi_tracking_enabled: false, design_studio_enabled: false, insights_enabled: false };

const KPI_PANELS = ["esg-ring", "materiality"];
const TOTALS = { gross: 0, net: 0, saved: 0, scope_1: 0, scope_2: 0, scope_3: 0, entries: 0, approved_count: 0, pending_count: 0, rejected_count: 0, pending_emission: 0, net_vs_last_year_pct: null };
const OVERVIEW = { period: { key: "2026-09" }, site_ids: [11, 12, 13], category_id: null, kpis: TOTALS, by_scope: [], by_site: [], by_month: [], yearly_total: 0, by_category: [], submission: { month: "2026-09", submitted: 0, missing: 0, users: [] }, trend: [], last_year: null };

export async function mockInsightsApi(page: Page, role: string, user: object, opts: Opts = {}) {
  const calls: Call[] = [];
  let companies = (opts.companies ?? [ACME]).map((c) => ({ ...c }));
  const insightsOn = () => opts.insights ?? companies[0]?.insights_enabled === true;
  const kpi = opts.kpi ?? false;
  let events = MOCK_EVENTS.map((e) => ({ ...e }));
  let nextId = events.length + 1;
  const panelData: Record<string, () => unknown> = {
    summary: () => summaryData(kpi),
    "esg-ring": () => esgRingData,
    decoupling: () => decouplingData,
    "target-wall": () => targetWallData(kpi),
    cards: () => cardsData(kpi),
    pathway: () => pathwayData(events),
    completeness: () => completenessData,
    bridge: () => bridgeData,
    flow: () => flowData(kpi),
    materiality: () => materialityData(opts.scored ?? true),
    stripes: () => stripesData,
  };
  await page.addInitScript(
    ([r, u]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [role, JSON.stringify(user)],
  );
  await page.route(
    (url) => url.port !== APP_PORT,
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const body = method === "GET" ? null : (request.postDataJSON() as Record<string, unknown> | null);
      calls.push({ method, path: `${path}${url.search}`, body });

      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: opts.appearance ?? "light" });
      if (path.endsWith("/brands/mine")) return json(opts.brand ?? {});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/kpi/status")) return json({ enabled: kpi, setup_completed: kpi });
      if (path.endsWith("/studio/status")) return json({ enabled: false, kinds: { ghg: false, sustainability: false } });
      if (path.endsWith("/insights/status")) return json({ enabled: insightsOn() && !opts.serverOff, kpi_tracking: kpi });
      if (path.includes("/insights/")) {
        if (!insightsOn() || opts.serverOff) return json({ code: "IN_OFF", message: "Insights isn't turned on for your company." }, 403);
        if (path.endsWith("/insights/sites")) return json({ sites: MOCK_SITES });
        if (path.endsWith("/insights/snapshot.pdf")) return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n% insights e2e snapshot\n%%EOF\n" });
        const ev = /\/insights\/events(?:\/(\d+))?$/.exec(path);
        if (ev) {
          if (method === "GET") return json({ events });
          if (method === "POST") {
            const e = { id: nextId++, date: String(body?.date), label: String(body?.label), kind: String(body?.kind), site_id: (body?.site_id as number | null) ?? null };
            events = [...events, e as (typeof events)[number]];
            return json(e, 201);
          }
          const id = Number(ev[1]);
          if (method === "PATCH") {
            events = events.map((e) => (e.id === id ? { ...e, ...(body as object) } : e));
            return json(events.find((e) => e.id === id));
          }
          if (method === "DELETE") {
            events = events.filter((e) => e.id !== id);
            return route.fulfill({ status: 204, body: "" });
          }
        }
        const panel = path.split("/insights/")[1];
        const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
        const yearType = url.searchParams.get("yearType") || "CY";
        const envelope = {
          panel: panel.replace("-", "_"),
          period: { year, yearType },
          sites: "all",
          label: `${yearType} ${year} · All sites`,
          pending_not_in: { emissions: 12, kpi_values: kpi ? 3 : 0, link: "/data/approvals" },
          stamp: "e2e",
          links: {} as Record<string, string>,
        };
        if (KPI_PANELS.includes(panel) && !kpi) return json({ ...envelope, availability: "kpi_off", data: null });
        const override = opts.panels?.[panel];
        if (override && "error" in override) return json({ message: "Server error" }, override.error);
        if (override) return json({ ...envelope, ...override, data: null });
        if (panel === "summary") envelope.links = { net: "/data/ledger?status=approved", intensity: "/data/production", readiness: "/kpi/esg", attention: "/data/approvals" };
        if (panel === "cards" && url.searchParams.get("ai") === "1" && opts.aiCards) return json({ ...envelope, availability: "ok", data: opts.aiCards(kpi) });
        return json({ ...envelope, availability: "ok", data: panelData[panel]?.() ?? {} });
      }
      // Overview (P06), enough for its header: nothing approved yet.
      if (path.endsWith("/manager/overview")) return json(OVERVIEW);
      if (path.endsWith("/manager/submission-status")) return json({ users: [] });
      if (path.endsWith("/user/emissions")) return json({ data: [], total: 0, summary: { total_emission: 0, pending_count: 0, approved_count: 0, rejected_count: 0 } });
      if (path.endsWith("/user/production-data/manager")) return json([]);
      const one = /\/admin\/companies\/(\d+)$/.exec(path);
      if (one && method === "PUT") {
        companies = companies.map((c) => (c.company_id === Number(one[1]) ? { ...c, ...body } : c));
        return json({ message: "Company updated" });
      }
      if (path.endsWith("/admin/companies")) return json(companies);
      if (path.endsWith("/admin/sites")) return json([{ site_id: 11, name: "Chennai plant", company: { company_id: 1 }, country: { name: "India" } }]);
      if (path.endsWith("/admin/users")) return json([]);
      return json({});
    },
  );
  return calls;
}

/** A Manager at all three mock plants of ACME. */
export const managerAt = (insights: boolean, kpi = false) => ({
  user_id: 12,
  name: "Mia Haddad",
  email: "mia@acme.example",
  sites: MOCK_SITES.map((s) => ({ ...s, company: { company_id: 1, name: "ACME", insights_enabled: insights, kpi_tracking_enabled: kpi } })),
});

/** Horizontal overflow of the page in px (0 = none). */
export const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

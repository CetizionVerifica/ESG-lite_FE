import type { Page } from "@playwright/test";
import { getResponse } from "msw";
import { kpiHandlers, resetKpiMocks, setKpiAiAvailable, setKpiMockEnabled, startKpiSetupFresh } from "../src/test/msw/kpi";

/**
 * KPI wave B Playwright API: every `/kpi/*` call is answered by the same
 * stateful MSW handlers the unit tests use (`src/test/msw/kpi.ts`), so the
 * mocks and the specs can't drift apart. Other calls get the shell's basics.
 */

export type Call = { method: string; path: string; body: unknown; /** The query string, e.g. `?company_id=1` (D18). */ search: string };

export const RAVI = {
  user_id: 11,
  name: "Ravi Kumar",
  email: "ravi@acme.example",
  site: { site_id: 1, name: "Bahrain plant", company: { company_id: 1, name: "ACME", kpi_tracking_enabled: true } },
};

export const OMAR = {
  user_id: 13,
  name: "Omar Saleh",
  email: "omar@acme.example",
  company: { company_id: 1, name: "ACME", kpi_tracking_enabled: true },
  sites: [
    { site_id: 1, name: "Bahrain plant", company: { company_id: 1, name: "ACME", kpi_tracking_enabled: true } },
    { site_id: 2, name: "Dammam", company: { company_id: 1, name: "ACME", kpi_tracking_enabled: true } },
    { site_id: 3, name: "Matola", company: { company_id: 1, name: "ACME", kpi_tracking_enabled: true } },
  ],
};

const ACME_ON = { company_id: 1, name: "ACME", kpi_tracking_enabled: true };

/** Mia Haddad, the Manager of all three plants (KPI-8 review, KPI-10 dashboard, KPI-11 reports). */
export const MIA = {
  user_id: 12,
  name: "Mia Haddad",
  email: "mia@acme.example",
  company: ACME_ON,
  sites: [
    { site_id: 1, name: "Bahrain plant", company: ACME_ON, categories: [] },
    { site_id: 2, name: "Dammam", company: ACME_ON, categories: [] },
    { site_id: 3, name: "Matola", company: ACME_ON, categories: [] },
  ],
};

/** Sam, ESGLite staff (Superadmin): works on ACME once it's the chosen client (D18). */
export const SAM = { user_id: 1, name: "Sam Staff", email: "sam@esglite.example" };
/** The Superadmin's client list (`/admin/companies`). */
export const CLIENTS = [ACME_ON, { company_id: 2, name: "Beta Steel", kpi_tracking_enabled: false }];

/** One history entry for any KPI value (`/user/audit-logs?entity_type=kpi_value`). */
const kpiAudit = (url: URL) =>
  url.searchParams.get("entity_type") === "kpi_value"
    ? [
        {
          id: 1,
          entity_type: "kpi_value",
          entity_id: Number(url.searchParams.get("entity_id")),
          action: "submit",
          changed_fields: { status: { old: "draft", new: "pending" } },
          reason: null,
          changed_by: { user_id: 14, name: "Sara Ali", email: "sara@acme.example", role: "User" },
          changed_at: "2026-10-05T10:00:00.000Z",
        },
      ]
    : [];

/**
 * `keepState` leaves the KPI mocks as an earlier page in the same test left
 * them (a Manager rejects, then the contributor opens My KPIs).
 */
export async function kpiApp(page: Page, opts: { role: string; user: object; enabled?: boolean; freshSetup?: boolean; keepState?: boolean; other?: (url: URL) => unknown; /** A Superadmin's chosen client at the start (D18). */ clientId?: number; /** KPI-12: the AI service is down. */ aiDown?: boolean; /** Wave E: the theme to render in (`/brands/mine` and the saved appearance). */ brand?: object; appearance?: "light" | "dark" }) {
  if (!opts.keepState) resetKpiMocks();
  if (opts.enabled === false) setKpiMockEnabled(false);
  if (opts.freshSetup) startKpiSetupFresh();
  if (opts.aiDown) setKpiAiAvailable(false);
  const calls: Call[] = [];
  const user = opts.enabled === false ? JSON.parse(JSON.stringify(opts.user).replace(/"kpi_tracking_enabled":true/g, '"kpi_tracking_enabled":false')) : opts.user;
  await page.addInitScript(
    ([r, u, c]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
      if (c) localStorage.setItem("esglite.clientId", c);
    },
    [opts.role, JSON.stringify(user), opts.clientId ? String(opts.clientId) : ""],
  );
  await page.route(
    (url) => url.port !== "4173",
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname;
      const method = req.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (method !== "GET") {
        let body: unknown = null;
        try {
          body = req.postDataJSON();
        } catch {
          body = "(multipart)";
        }
        calls.push({ method, path, body, search: url.search });
      }

      if (path.endsWith("/auth/me")) return json({ role: opts.role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: opts.appearance ?? "light" });
      if (path.endsWith("/brands/mine")) return json(opts.brand ?? {});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/user/audit-logs")) return json(kpiAudit(url));
      if (path.endsWith("/admin/companies") && opts.role === "Superadmin") return json(CLIENTS.map((c) => (c.company_id === 1 && opts.enabled === false ? { ...c, kpi_tracking_enabled: false } : c)));
      if (/\/kpi(\/|$)/.test(path)) {
        const headers = new Headers(req.headers());
        const body = method === "GET" || method === "HEAD" ? undefined : (req.postDataBuffer() ?? undefined);
        const res = await getResponse(kpiHandlers, new Request(req.url(), { method, headers, body }));
        if (res) {
          return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers.entries()), body: Buffer.from(await res.arrayBuffer()) });
        }
        return json({ message: "Not found" }, 404);
      }
      const answer = opts.other?.(url);
      return json(answer ?? {});
    },
  );
  return calls;
}

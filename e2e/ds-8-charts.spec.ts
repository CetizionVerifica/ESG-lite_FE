import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";

/**
 * DS-8 · charts and tables in the editor (`/studio/:id`) on an in-memory API:
 * add Scope 3 category bars from the Charts drawer, switch to a treemap,
 * change top n, ask for three years and grey the prior ones; then a custom
 * data chart filled by pasting a spreadsheet table, which shows the
 * "Unlinked data" badge on the sheet. Plus the switch-off path.
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as Doc;

type El = { id: string; type: string; props: Record<string, unknown> };
type Pg = { id: string; kind: string; elements?: El[] };
type Doc = { pages: Pg[]; [k: string]: unknown };
type GhgB = { source: string; metric?: string; breakdown?: string; years?: { last: number } | number[]; top?: number };

const CATS: [string, number][] = [
  ["1 · Purchased goods and services", 1290],
  ["4 · Upstream transportation and distribution", 620],
  ["6 · Business travel", 410],
  ["7 · Employee commuting", 300],
  ["5 · Waste generated in operations", 210],
  ["3 · Fuel- and energy-related activities", 180],
  ["2 · Capital goods", 140],
  ["9 · Downstream transportation and distribution", 70],
  ["12 · End-of-life treatment of sold products", 50],
];
const BY: Record<string, [string, number][]> = {
  scope: [["Scope 1", 3410], ["Scope 2", 5800], ["Scope 3", 3270]],
  scope3_category: CATS,
  site: [["Bahrain plant", 6900], ["Sitra warehouse", 2380]],
  gas: [["CO₂", 8350], ["CH₄", 19.8], ["N₂O", 2.9]],
  month: Array.from({ length: 12 }, (_, m) => [`2025-${String(m + 1).padStart(2, "0")}`, 1000 + m * 10] as [string, number]),
};

/** A made-up resolved value in DS-2's series shapes (one series per year keyed by the breakdown, top n + Other). */
function resolved(b: GhgB, i: number) {
  const value = 1000 + i * 111;
  const years = Array.isArray(b.years) ? b.years : Array.from({ length: b.years?.last ?? 1 }, (_, k) => 2025 - (b.years && !Array.isArray(b.years) ? b.years.last : 1) + 1 + k);
  const base = { display: value.toLocaleString("en-GB"), value, unit: "tCO₂e", source: b.source, approvedAt: "2026-04-12T00:00:00.000Z" };
  if (b.source === "custom") return { display: "", value: null, unit: null, source: "custom" };
  if (b.breakdown && BY[b.breakdown]) {
    let pts = BY[b.breakdown];
    if (b.top && pts.length > b.top) pts = [...pts.slice(0, b.top), ["Other", pts.slice(b.top).reduce((a, p) => a + p[1], 0)]];
    return { ...base, series: years.map((y) => ({ label: String(y), values: pts.map(([key, v]) => ({ key, value: Math.round(v * (1 + (2025 - y) * 0.05)) })) })) };
  }
  return { ...base, series: [{ label: "Total", values: years.map((y) => ({ key: String(y), value })) }] };
}

async function mockApi(page: Page, opts: { studio?: boolean } = {}) {
  const studio = opts.studio ?? true;
  const state = { doc: JSON.parse(JSON.stringify(FIXTURE)) as Doc, rev: 1 };
  const user = {
    user_id: 12,
    name: "Mia Haddad",
    email: "mia@acme.example",
    sites: [{ site_id: 1, name: "Bahrain plant", company: { company_id: 1, name: "ACME", design_studio_enabled: studio, kpi_tracking_enabled: false } }],
    company: { company_id: 1, name: "ACME", design_studio_enabled: studio },
  };
  await page.addInitScript(
    ([u]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", "Manager");
      localStorage.setItem("user", u);
      sessionStorage.clear();
    },
    [JSON.stringify(user)],
  );
  await page.route(
    (url) => url.port !== APP_PORT && !url.protocol.startsWith("data"),
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/kpi/status")) return json({ enabled: false, setup_completed: false });
      if (path.endsWith("/studio/status")) return json({ enabled: studio, kinds: { ghg: studio, sustainability: false } });
      if (!studio && path.includes("/studio/")) return json({ code: "DS_STUDIO_OFF", message: "Off" }, 403);
      if (path.endsWith("/studio/docs/1") && method === "GET") return json({ id: 1, doc: state.doc, rev: state.rev, status: "draft" });
      if (path.endsWith("/studio/docs/1") && method === "PATCH") {
        const b = request.postDataJSON() as { rev: number; doc: Doc };
        if (b.rev !== state.rev) return json({ code: "DS_VERSION_CONFLICT", message: "Stale", details: { rev: state.rev } }, 409);
        state.doc = b.doc;
        state.rev += 1;
        return json({ id: 1, doc: state.doc, rev: state.rev, status: "draft" });
      }
      if (path.endsWith("/studio/resolve")) {
        const b = request.postDataJSON() as { bindings: GhgB[]; tokens: unknown[] };
        return json({ values: b.bindings.map((x, i) => resolved(x, i)), tokens: b.tokens.map((_, i) => resolved({ source: "ghg" }, i)), dataHash: "h", unavailable: [] });
      }
      if (path.endsWith("/studio/docs/1/inputs")) return json({ rev: state.rev, inputs: {}, prefill: { base_year: { value: 2022, source: "company" } } });
      if (path.endsWith("/studio/data")) return json({ groups: [{ id: "scopes", label: "Scopes", items: [{ id: "total", label: "Total emissions", binding: { source: "ghg", metric: "total", years: { last: 1 }, sites: "all" }, resolved: { display: "12,480", value: 12480, unit: "tCO₂e", approvedAt: "2026-04-12T00:00:00.000Z" } }] }] });
      if (path.endsWith("/studio/assets")) return json([]);
      if (path.endsWith("/studio/layouts")) return json([]);
      if (path.endsWith("/studio/elements")) return json([]);
      if (path.endsWith("/studio/brand-kit"))
        return json({ name: "ACME", logos: { primary: null, onDark: null }, colors: { primary: "#0f5132", accent: "#f59e0b", coverFrom: "#0d1526", coverTo: "#0f5132" }, defaultLook: "classic", fonts: { heading: null, body: null }, voice: "", palettes: [], canEdit: true, brandControls: false, updatedAt: null });
      if (path.includes("/studio/fonts/")) return route.fulfill({ status: 404, body: "" });
      return json({});
    },
  );
  return state;
}

/** The new chart on the cover (the page in view when the editor opens), as last autosaved. */
const newChart = (s: { doc: Doc }) => (s.doc.pages.find((p) => p.id === "p-cover")?.elements ?? []).find((e) => e.type === "chart");

test.use({ viewport: { width: 1600, height: 1000 } });

test("Scope 3 category bars → treemap → top 5 → three years with prior years grey; a pasted custom table is marked Unlinked", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/studio/1");
  await expect(page.getByTestId("studio-editor")).toBeVisible();
  await expect(page.getByTestId("overlay-p-cover")).toBeVisible();

  // 1. Charts drawer → Scope 3 categories, bound to Scope 3 by category, this year, top 8.
  await page.getByRole("tab", { name: "Charts" }).click();
  const tile = page.getByTestId("chart-kind-category_bars");
  await expect(tile).toBeEnabled();
  await tile.click();
  const toolbar = page.getByTestId("context-toolbar");
  await expect(toolbar).toHaveAttribute("data-toolbar", "chart");
  await expect(toolbar.getByTestId("chart-kind")).toContainText("Scope 3 categories");
  const host = page.locator('[data-sheet-host="p-cover"]');
  await expect(host.locator('[data-ghg-chart="category_bars"]')).toBeVisible();
  await expect.poll(() => (newChart(state)?.props.binding as GhgB | undefined)?.top, { timeout: 5000 }).toBe(8);

  // 2. Switch to a treemap (only kinds that can draw this data are offered).
  await toolbar.getByTestId("chart-kind").click();
  const kinds = page.getByRole("menu", { name: "Chart kind" });
  await expect(kinds.getByRole("menuitemradio", { name: "Scope split" })).toHaveCount(0);
  await kinds.getByRole("menuitemradio", { name: "Treemap" }).click();
  await expect(host.locator('[data-ghg-chart="treemap"]')).toBeVisible();

  // 3. Top 5: five categories + Other.
  await toolbar.getByTestId("chart-top").click();
  await page.getByRole("menuitemradio", { name: "Top 5" }).click();
  await expect(host.locator('[data-ghg-chart="treemap"]')).toHaveAttribute("data-tiles", "6");

  // 4. Three years from Edit data, then prior years grey (on by default) and off again.
  await toolbar.getByTestId("chart-edit-data").click();
  const editor = page.getByTestId("binding-editor");
  await expect(editor.getByTestId("binding-summary")).toHaveText("Scope 3 · by scope 3 category · this year · top 5");
  await editor.getByRole("combobox", { name: "Years" }).selectOption("3");
  await expect(editor.getByTestId("binding-summary")).toContainText("last 3 years");
  await toolbar.getByTestId("chart-kind").click();
  await page.getByRole("menuitemradio", { name: "Scope 3 categories" }).click();
  const grey = toolbar.getByTestId("chart-grey-prior");
  await expect(grey).toBeEnabled();
  await expect(grey).toHaveAttribute("aria-pressed", "true");
  await expect(host.locator('[data-ghg-chart="category_bars"] [data-prior="2024"]').first()).toHaveAttribute("fill", "#B8C0CC");
  await grey.click();
  await expect(grey).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => JSON.stringify(newChart(state)?.props), { timeout: 5000 }).toContain('"greyPrior":false');
  expect(newChart(state)?.props).toMatchObject({ kind: "category_bars", binding: { metric: "scope3", breakdown: "scope3_category", top: 5, years: { last: 3 } } });

  // 5. A custom data chart: the grid opens; paste a table from a spreadsheet.
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Charts" }).click();
  await page.getByTestId("chart-kind-custom").click();
  const grid = page.getByTestId("custom-grid");
  await expect(grid).toBeVisible();
  const first = grid.getByLabel("Column 1 heading");
  await first.focus();
  await first.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "Initiative\tSaved\nLED retrofit\t1,200\nSolar PPA\t860\nFleet EVs\t310\n");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(grid.getByLabel("Row 3, Saved")).toHaveValue("310");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(grid).toHaveCount(0);
  const custom = host.locator('[data-source="custom"]').last();
  await expect(custom.locator(".ds-unlinked")).toHaveText("Unlinked data");
  await expect(custom.locator(".ds-unlinked")).toBeVisible();
  await expect(toolbar.getByTestId("toolbar-link")).toContainText("Unlinked");
  await expect
    .poll(() => JSON.stringify((state.doc.pages.find((p) => p.id === "p-cover")?.elements ?? []).filter((e) => (e.props.binding as GhgB | undefined)?.source === "custom").map((e) => e.props.binding)), { timeout: 5000 })
    .toBe(JSON.stringify([{ source: "custom", columns: ["Initiative", "Saved"], rows: [["LED retrofit", 1200], ["Solar PPA", 860], ["Fleet EVs", 310]] }]));
});

test("switch off: the editor isn't reachable", async ({ page }) => {
  await mockApi(page, { studio: false });
  await page.goto("/studio/1");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("studio-editor")).toHaveCount(0);
});

import { readFileSync } from "node:fs";
import { type Locator, type Page, expect, test } from "@playwright/test";
import { getResponse } from "msw";
import { kpiHandlers } from "../src/test/msw/kpi";
import { MIA, RAVI, kpiApp } from "./kpiMockApi";

/**
 * #209 follow-up · a tCO₂e figure has 3 decimals, so it's longer. With a big
 * one (123,456.789 tCO₂e) in place of the sample's, the KPI cards, rows and
 * drawers and the Design Studio chips show it whole: on one line, inside
 * their card, row or box, and the page doesn't scroll sideways. KPI pages at
 * 1280, 1024, 768 and 390 px; the studio editor at 1280 px (it needs ≥ 1280).
 * The chip's hover card is checked in TextEditing.test.tsx.
 */

const BIG = 123456.789;
const TEXT = "123,456.789 tCO₂e";
const WIDTHS = [1280, 1024, 768, 390];

/** Answers GET `path` from the KPI mocks with `edit` applied: the big figure in place of the sample's. */
async function bigFigure(page: Page, path: RegExp, edit: (body: Record<string, unknown[]>) => void) {
  await page.route(
    (url) => url.port !== "4173" && path.test(url.pathname),
    async (route) => {
      const req = route.request();
      if (req.method() !== "GET") return route.fallback();
      const res = await getResponse(kpiHandlers, new Request(req.url(), { headers: new Headers(req.headers()) }));
      if (!res) return route.fallback();
      const body = (await res.json()) as Record<string, unknown[]>;
      edit(body);
      return route.fulfill({ status: res.status, json: body });
    },
  );
}

type Row = Record<string, unknown>;
const each = (list: unknown, pick: (r: Row) => boolean, set: Row) => (list as Row[]).filter(pick).forEach((r) => Object.assign(r, set));

async function bigKpiFigures(page: Page) {
  await bigFigure(page, /\/kpi\/dashboard$/, (b) => each(b.cards, (c) => c.code === "GHG_SCOPE1", { value: BIG }));
  await bigFigure(page, /\/kpi\/esg$/, (b) => each(b.trends, (t) => t.code === "GHG_SCOPE1_2", { value: BIG }));
  await bigFigure(page, /\/kpi\/targets$/, (b) => each(b.targets, (t) => t.kpi_definition_id === 1, { baseline_value: BIG, current_value: 111111.111, target_value: 98765.432 }));
  await bigFigure(page, /\/kpi\/reports\/GRI$/, (b) => each(b.rows, (r) => r.code === "305-1", { value: BIG }));
  await bigFigure(page, /\/kpi\/values$/, (b) => each(b.values, (v) => v.id === 3, { value_numeric: BIG, value_canonical: BIG }));
  await bigFigure(page, /\/kpi\/my$/, (b) => (b.items as Row[]).filter((i) => i.code === "GHG_SCOPE1" && i.value).forEach((i) => Object.assign(i.value as Row, { value_numeric: BIG, value_canonical: BIG })));
}

/** The text `t` inside `el` sits on one line (it may wrap before or after, never inside). */
const onOneLine = (el: Locator, t: string) =>
  el.evaluate((node, s) => {
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const at = (n.textContent ?? "").indexOf(s);
      if (at < 0) continue;
      const r = document.createRange();
      r.setStart(n, at);
      r.setEnd(n, at + s.length);
      return new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size === 1;
    }
    return false;
  }, t);

/** `el` sits inside `box`, left to right. */
async function inside(el: Locator, box: Locator, what: string) {
  const a = await el.boundingBox();
  const b = await box.boundingBox();
  if (!a || !b) throw new Error(`${what}: not on screen`);
  expect(a.x, `${what} starts inside its box`).toBeGreaterThanOrEqual(b.x - 1);
  expect(a.x + a.width, `${what} ends inside its box`).toBeLessThanOrEqual(b.x + b.width + 1);
}

/** `el` shows `text` whole: the number on one line, inside `box` left to right. */
async function fits(el: Locator, box: Locator, text = TEXT) {
  await expect(el).toContainText(text);
  expect(await onOneLine(el, text.split(" ")[0]), `${text} on one line`).toBe(true);
  await inside(el, box, text);
}

const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

for (const width of WIDTHS) {
  test(`KPI pages show a 3-decimal tCO₂e figure whole at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await kpiApp(page, { role: "Manager", user: MIA });
    await bigKpiFigures(page);

    // Dashboard card.
    await page.goto("/kpi/dashboard");
    const card = page.getByTestId("kpi-card").filter({ hasText: "Scope 1 emissions" });
    await fits(card.getByTestId("kpi-card-value"), card);
    await noSideScroll(page);

    // ESG headline trend, then the whole page: each pillar card's change chip ("+50 pp on last year ·
    // Better") wraps inside its card rather than pushing the page sideways (it stuck out 15 px at 768 px).
    await page.goto("/kpi/esg");
    const trend = page.locator('[data-testid="esg-trend"][data-kpi="GHG_SCOPE1_2"]');
    await fits(trend.getByTestId("esg-trend-value"), trend);
    const pillars = page.getByTestId("esg-pillar-card");
    await expect(pillars).toHaveCount(3);
    for (const pillar of await pillars.all()) {
      const chip = pillar.getByTestId("change-chip");
      await expect(chip).toContainText(/pp on last year/);
      await inside(chip, pillar, `the ${await pillar.getAttribute("data-pillar")} pillar's change chip`);
    }
    await noSideScroll(page);
    await page.goto("/kpi/esg?topic=climate");
    const row = page.getByRole("dialog").getByTestId("esg-drawer-kpi").filter({ hasText: "Scope 1 emissions" });
    await fits(row.getByText(TEXT), row);

    // Target card: baseline, now and target.
    await page.goto("/kpi/targets");
    const target = page.getByTestId("kpi-target").filter({ hasText: "Scope 1 emissions" });
    const figures = target.getByRole("definition");
    await expect(figures).toHaveText([TEXT, "111,111.111 tCO₂e", "98,765.432 tCO₂e"]);
    for (const [i, t] of [TEXT, "111,111.111 tCO₂e", "98,765.432 tCO₂e"].entries()) await fits(figures.nth(i), target, t);
    await noSideScroll(page);

    // Framework report → the one value behind 305-1 opens in its drawer.
    await page.goto("/reports/kpi/GRI");
    const report = page.getByTestId("kpi-report-row").filter({ has: page.getByRole("rowheader", { name: "305-1", exact: true }) });
    await expect(report).toContainText(TEXT);
    await noSideScroll(page);
    await report.getByRole("button", { name: /123,456\.789 tCO₂e/ }).click();
    const drawer = page.getByRole("dialog", { name: "Scope 1 emissions" });
    await fits(drawer.getByTestId("kpi-review-value"), drawer);
  });

  test(`My KPIs shows a 3-decimal tCO₂e figure whole at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await kpiApp(page, { role: "User", user: RAVI });
    await bigKpiFigures(page);
    await page.goto("/kpi?period=2026-09");
    const row = page.getByTestId("kpi-row").filter({ hasText: "Scope 1 emissions" });
    await fits(row.getByText(TEXT), row);
    await noSideScroll(page);
  });
}

// ---------------------------------------------------------------------------
// Design Studio: the Data drawer row and a chip in a heading
// ---------------------------------------------------------------------------

const APP_PORT = process.env.E2E_PORT ?? "4173";
type Doc = { pages: unknown[]; [k: string]: unknown };
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as Doc;
/** The server's display strings (src/studio/sources/format.ts): tCO₂e with 3 decimals. */
const DISPLAY: Record<string, string> = { total: "130,000.000", scope1: "123,456.789", scope2_location: "6,543.211" };

async function studioApi(page: Page) {
  const state = { doc: JSON.parse(JSON.stringify(FIXTURE)) as Doc, rev: 1 };
  const user = {
    user_id: 12,
    name: "Mia Haddad",
    email: "mia@acme.example",
    sites: [{ site_id: 1, name: "Bahrain plant", company: { company_id: 1, name: "ACME", design_studio_enabled: true, kpi_tracking_enabled: false } }],
    company: { company_id: 1, name: "ACME", design_studio_enabled: true },
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
  const value = (b: { source: string; metric?: string }) => {
    const display = (b.source === "ghg" && b.metric && DISPLAY[b.metric]) || "1,000.000";
    return { display, value: Number(display.replace(/,/g, "")), unit: "tCO₂e", source: b.source, approvedAt: "2026-04-12T00:00:00.000Z", approvedEntries: 318, series: [{ label: "2025", values: [{ key: "2025", value: 1 }] }] };
  };
  const g = (metric: string) => ({ source: "ghg", metric, years: { last: 1 }, sites: "all" });
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
      if (path.endsWith("/studio/status")) return json({ enabled: true, kinds: { ghg: true, sustainability: false } });
      if (path.endsWith("/studio/docs/1") && method === "GET") return json({ id: 1, doc: state.doc, rev: state.rev, status: "draft" });
      if (path.endsWith("/studio/docs/1/inputs")) return json({ rev: 1, inputs: {}, prefill: {} });
      if (path.endsWith("/studio/docs/1") && method === "PATCH") {
        const b = request.postDataJSON() as { rev: number; doc: Doc };
        if (b.rev !== state.rev) return json({ code: "DS_VERSION_CONFLICT", message: "Stale", details: { rev: state.rev } }, 409);
        state.doc = b.doc;
        state.rev += 1;
        return json({ id: 1, doc: state.doc, rev: state.rev, status: "draft" });
      }
      if (path.endsWith("/studio/resolve")) {
        const b = request.postDataJSON() as { bindings: { source: string; metric?: string }[]; tokens: { attrs: { binding: { source: string; metric?: string } } }[] };
        return json({ values: b.bindings.map(value), tokens: b.tokens.map((t) => value(t.attrs.binding)), dataHash: "h", unavailable: [] });
      }
      if (path.endsWith("/studio/data")) {
        const item = (id: string, label: string) => ({ id, label, binding: g(id), resolved: { display: DISPLAY[id], value: Number(DISPLAY[id].replace(/,/g, "")), unit: "tCO₂e", approvedAt: "2026-04-12T00:00:00.000Z" } });
        return json({ kind: "ghg", year: 2025, yearType: "CY", siteIds: [1], groups: [{ id: "scopes", label: "Scopes", items: [item("total", "Total emissions"), item("scope1", "Scope 1"), item("scope2_location", "Scope 2 (location-based)")] }] });
      }
      if (path.endsWith("/studio/assets")) return json([]);
      if (path.endsWith("/studio/layouts")) return json([]);
      if (path.endsWith("/studio/elements")) return json([]);
      if (path.endsWith("/studio/brand-kit"))
        return json({ name: "ACME", logos: { primary: null, onDark: null }, colors: { primary: "#0f5132", accent: "#f59e0b", coverFrom: "#0d1526", coverTo: "#0f5132" }, defaultLook: "classic", fonts: { heading: null, body: null }, voice: "", palettes: [], canEdit: true, brandControls: false, updatedAt: null });
      if (path.includes("/studio/fonts/")) return route.fulfill({ status: 404, body: "" });
      return json({});
    },
  );
}

test("the studio editor shows a 3-decimal tCO₂e chip whole at 1280 px: in the Data drawer, while editing and on the sheet", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await studioApi(page);
  await page.goto("/studio/1");
  await expect(page.getByTestId("studio-editor")).toBeVisible();

  // The Data drawer row: the value whole, the label gives way.
  await page.getByRole("tab", { name: "Data" }).click();
  const item = page.getByTestId("data-item-scope1");
  await fits(item.getByText("123,456.789"), item, "123,456.789");
  await page.getByRole("tab", { name: "Data" }).click();

  // A chip in the summary heading (20,20 mm; 170 × 15 mm), as DS-7 inserts it.
  const summary = page.getByTestId("overlay-p-summary");
  await summary.scrollIntoViewIfNeeded();
  const box = (await summary.boundingBox())!;
  const zoom = Number((await page.getByTestId("zoom-value").textContent())!.replace("%", "")) / 100;
  const k = (96 / 25.4) * zoom;
  await page.mouse.dblclick(box.x + 60 * k, box.y + 27 * k);
  const editing = page.getByTestId("text-edit-overlay");
  await expect(editing.locator(".ProseMirror")).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type(" {{scope");
  await page.getByRole("dialog", { name: "Insert data value" }).getByTestId("pick-scope1").click();
  const chip = editing.getByTestId("data-chip");
  await fits(chip, editing, "123,456.789");

  // On the sheet, the chip stays inside the heading's frame.
  await page.keyboard.press("Escape");
  await expect(editing).toHaveCount(0);
  const heading = page.locator('[data-sheet-host="p-summary"] [data-el-id="p-summary.heading"]');
  await fits(heading.locator(".ds-chip"), heading, "123,456.789");
  await noSideScroll(page);
});

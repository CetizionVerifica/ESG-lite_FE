import { type Page, expect, test } from "@playwright/test";

/**
 * DS-5 · GHG report page → Design this report → pick Inventory → build → the
 * editor shows 20+ pages with numbers matching the GHG page; and the switch-off
 * path. In-memory API: the GHG report endpoints and the /studio routes the flow
 * calls, with every studio write recorded.
 */

type Call = { method: string; path: string; query: URLSearchParams; body: Record<string, unknown> | null };

const company = (studio: boolean) => ({ company_id: 1, name: "Midal Cables", design_studio_enabled: studio, kpi_tracking_enabled: false });
const userFor = (studio: boolean) => ({
  name: "Mia Manager",
  email: "mia@example.com",
  sites: [
    { site_id: 1, name: "Hidd", company: company(studio), categories: [{ category_id: 10, category_name: "Diesel" }] },
    { site_id: 2, name: "Sitra", company: company(studio), categories: [{ category_id: 20, category_name: "Electricity" }] },
  ],
});

// The GHG page's figures (tCO₂e): the design must show the same.
const TOTALS = { scope1: 30, scope2: 70, scope3: 0, total: 100 };

function tables(body: { siteIds: number[]; yearType: string; year: number }) {
  const site = (siteId: number, siteName: string, value: number) => ({ siteId, siteName, value });
  return {
    filters: { siteIds: body.siteIds, categoryIds: null, yearType: body.yearType, year: body.year, compareYear: body.year - 1, fiscalYearStartMonth: 4 },
    ranges: {},
    totals: { [String(body.year)]: TOTALS, [String(body.year - 1)]: { scope1: 40, scope2: 85, scope3: 0, total: 125 } },
    tables: {
      table1_emissionsByScope_twoYears: [],
      table_overviewByLocations_selectedYear: {
        year: body.year,
        rows: [
          { scope: "Scope 1", category: "Diesel", bySite: [site(1, "Hidd", 30)], total: 30 },
          { scope: "Scope 2", category: "Electricity", bySite: [site(1, "Hidd", 50), site(2, "Sitra", 20)], total: 70 },
        ],
      },
      table_overviewByLocations_compareYear: { year: body.year - 1, rows: [] },
    },
  };
}

const text = (id: string, y: number, t: string) => ({
  id,
  type: "text",
  frame: { x: 20, y, w: 170, h: 20, rotation: 0 },
  z: 1,
  source: "layout",
  props: { style: "heading", align: "left", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] } },
});
const big = (id: string, metric: string, label: string) => ({
  id,
  type: "big_number",
  frame: { x: 20, y: 60, w: 90, h: 30, rotation: 0 },
  z: 2,
  source: "layout",
  props: { binding: { source: "ghg", metric, years: { last: 1 }, sites: "all" }, measure: "value", label, showDelta: false },
});
const SECTIONS = ["Statement of compliance", "Contents", "Executive summary", "Boundaries", "Methodology", "Scope 1 by source", "Scope 1 by gas", "Scope 2", "Scope 3", "Scope 3 by category", "By site", "Intensity", "Base year and trend", "Data quality", "Reduction initiatives", "Assurance", "Annex: factors", "Annex: exclusions", "Annex: glossary", "Back cover", "Notes"];

function builtDoc(body: Record<string, unknown>) {
  const year = Number(body.year);
  const yearType = String(body.yearType);
  const label = yearType === "FY" ? `FY ${year - 1}–${String(year).slice(-2)}` : String(year);
  const pages = [
    { id: "p-cover", kind: "freeform", name: "Cover", background: { color: "#0F5132" }, elements: [text("p-cover.title", 180, `Greenhouse gas inventory ${label}`), big("p-cover.total", "total", "tCO₂e total")] },
    ...SECTIONS.map((name, i) => ({
      id: `p-${i}`,
      kind: "freeform",
      name,
      background: {},
      elements: [text(`p-${i}.h`, 20, name), ...(name === "Scope 1 by source" ? [big(`p-${i}.s1`, "scope1", "Scope 1, tCO₂e")] : []), ...(name === "Scope 2" ? [big(`p-${i}.s2`, "scope2_location", "Scope 2 (location-based), tCO₂e")] : [])],
    })),
  ];
  return {
    schemaVersion: 2,
    kind: "ghg",
    purpose: "report",
    format: "a4",
    meta: { title: `Inventory ${label}`, year, yearType, sites: body.sites, frameworks: body.frameworks, compareYear: body.compareYear, language: "en" },
    design: { templateId: "1", templateVersion: 1, theme: { look: "classic" } },
    pages,
    assets: [],
  };
}

async function signIn(page: Page, studio: boolean) {
  const calls: Call[] = [];
  const user = userFor(studio);
  let doc: Record<string, unknown> | null = null;
  let polls = 0;
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const body = method === "GET" ? null : ((request.postDataJSON() as Record<string, unknown> | null) ?? null);
      if (path.includes("/studio/")) calls.push({ method, path, query: url.searchParams, body });
      const json = (b: unknown, status = 200) => route.fulfill({ status, json: b });
      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/kpi/status")) return json({ enabled: false, setup_completed: false });
      if (path.endsWith("/user/reporting-calendar")) return json({ fiscalYearStartMonth: 4, fiscalYearRule: "" });
      if (path.endsWith("/user/ghg/tables")) return json(tables(body as never));
      if (path.endsWith("/studio/status")) return json({ enabled: studio, kinds: { ghg: studio, sustainability: false } });
      if (!studio && path.startsWith("/studio/")) return json({ code: "DS_STUDIO_OFF", message: "Off" }, 403);
      if (path.endsWith("/studio/templates"))
        return json([
          { id: 1, companyId: null, kind: "ghg", purpose: "report", format: "a4", name: "Inventory", tags: ["GHG Protocol"], version: 1, thumbnailUrl: null, pageCount: 22 },
          { id: 3, companyId: null, kind: "ghg", purpose: "deck", format: "slide_16_9", name: "Board brief", tags: [], version: 1, thumbnailUrl: null, pageCount: 9 },
        ]);
      if (path.endsWith("/studio/inputs/prefill")) return json({ keys: [], prefill: { consolidation_approach: { value: "Operational control", source: "company" } } });
      if (path.endsWith("/studio/brand-kit")) return json({ name: "Midal", logos: { primary: null, onDark: null }, colors: { primary: "#0F5132", accent: "#F59E0B", coverFrom: "#0F5132", coverTo: "#0B3D26" }, defaultLook: "classic", fonts: { heading: null, body: null }, voice: "", palettes: [], canEdit: true, brandControls: false, updatedAt: null });
      if (path.endsWith("/studio/docs") && method === "POST") {
        doc = builtDoc(body ?? {});
        polls = 0;
        return json({ id: 41, rev: 1, status: "draft", title: (doc.meta as { title: string }).title, build: { state: "running", steps: [], dropped: [], pageCount: null, startedAt: "", finishedAt: null } }, 202);
      }
      if (path.endsWith("/studio/docs/41") && url.searchParams.get("build") === "1") {
        polls += 1;
        const done = polls >= 2;
        const steps = ["Loading the template", "Reading your approved data", "Laying out the pages", "Filling in report details", "Writing text with AI", "Saving the design"].map((label, i) => ({
          id: ["template", "data", "layout", "inputs", "ai", "save"][i],
          label,
          state: done || i < 3 ? "done" : i === 3 ? "running" : "pending",
        }));
        return json({ id: 41, rev: 1, status: "draft", title: "Inventory", build: { state: done ? "done" : "running", steps, dropped: [], pageCount: done ? 22 : null, startedAt: "", finishedAt: done ? "" : null } });
      }
      if (path.endsWith("/studio/docs/41") && method === "GET") return json({ id: 41, doc, rev: 1, status: "draft", title: (doc?.meta as { title: string }).title, dataHash: "sha256:x", updatedAt: "2026-10-20T09:00:00Z", build: null });
      if (path.endsWith("/studio/docs/41/presence")) return json({ others: 0 });
      if (path.endsWith("/studio/resolve")) {
        const bindings = ((body?.bindings as { metric: string }[]) ?? []).map((b) => {
          const v = b.metric === "total" ? TOTALS.total : b.metric === "scope1" ? TOTALS.scope1 : b.metric === "scope2_location" ? TOTALS.scope2 : null;
          return v === null ? { source: "ghg", display: "Not reported", value: null, unit: null, unavailable: { reason: "NO_DATA" } } : { source: "ghg", display: v.toFixed(3), value: v, unit: "tCO₂e", approvedAt: "2026-04-12T00:00:00Z" }; // #209: the server prints tCO₂e with 3 decimals
        });
        return json({ values: bindings, tokens: [], dataHash: "sha256:x", unavailable: [] });
      }
      if (path.startsWith("/studio/")) return json({ code: "DS_DOC_NOT_FOUND", message: "Not found." }, 404);
      return json({});
    },
  );
  return calls;
}

test("GHG report → Design this report → Inventory → build → the editor shows 20+ pages with the GHG page's numbers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await signIn(page, true);
  await page.goto("/reports/ghg?cal=FY&freq=year&year=2026&site=1");
  await expect(page.getByRole("heading", { level: 1, name: "GHG report" })).toBeVisible();
  await page.getByRole("button", { name: "Design this report" }).click();

  await expect(page).toHaveURL(/\/studio\/new\?kind=ghg&format=a4&purpose=report&year=2026&yearType=FY&compareYear=2025&siteIds=1$/);
  await expect(page.getByRole("heading", { name: "New GHG report" })).toBeVisible();
  await page.getByTestId("template-1").click();
  await page.getByTestId("new-next").click();
  await expect(page.getByLabel("Year", { exact: true })).toHaveValue("2026");
  await page.getByTestId("new-next").click();
  await expect(page.getByTestId("input-consolidation_approach")).toBeVisible();
  await page.getByTestId("new-next").click();
  await page.getByTestId("new-build").click();
  await expect(page.getByTestId("build-progress")).toBeVisible();

  await expect(page).toHaveURL(/\/studio\/41$/);
  await expect(page.getByTestId("studio-editor")).toBeVisible();
  const pages = page.locator("[data-page-slot]");
  await expect(pages).toHaveCount(22);
  // The cover total and the Scope 1 page show the GHG report's figures, drawn by the renderer in shadow roots.
  await expect(page.locator('[data-sheet-host="p-cover"]')).toContainText("100.000");
  await page.locator('[data-page-slot="p-5"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-sheet-host="p-5"]')).toContainText("30.000");
  await expect(page.getByTestId("page-counter")).toContainText("/ 22");

  const create = calls.find((c) => c.method === "POST" && c.path.endsWith("/studio/docs"));
  expect(create?.query.get("wait")).toBe("0");
  expect(create?.body).toMatchObject({ kind: "ghg", templateId: 1, year: 2026, yearType: "FY", compareYear: 2025, sites: [1], ai: true });
});

test("with the studio off, the GHG report has no Design this report button", async ({ page }) => {
  await signIn(page, false);
  await page.goto("/reports/ghg?cal=CY&freq=year&year=2025");
  await expect(page.getByRole("heading", { level: 1, name: "GHG report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export tables" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Design this report" })).toHaveCount(0);
});

import { type Page, expect, test } from "@playwright/test";

/**
 * AT-1 · "Help me choose" on /studio/new: answer the brief → three suggestion
 * cards with reasons and data-readiness badges → Preview with my data (pages
 * drawn by the renderer with /studio/resolve values) → Use this picks the
 * template and moves on to the scope step. Plus the rule-order fallback when
 * the AI isn't used. In-memory API with every studio write recorded.
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
type Call = { method: string; path: string; body: Record<string, unknown> | null };

const company = { company_id: 1, name: "Midal Cables", design_studio_enabled: true, kpi_tracking_enabled: false };
const user = { name: "Mia Manager", email: "mia@example.com", sites: [{ site_id: 1, name: "Hidd", company, categories: [] }] };

const template = (id: number, name: string, format = "a4", pageCount = 22) => ({ id, companyId: null, kind: "ghg", purpose: format === "a4" ? "report" : "deck", format, name, tags: [], version: 1, thumbnailUrl: null, pageCount, look: "classic" });
const TEMPLATES = [template(1, "Inventory"), template(2, "Verifier pack", "a4", 30), template(3, "Board brief", "slide_16_9", 9)];

const text = (id: string, t: string) => ({ id, type: "text", frame: { x: 20, y: 30, w: 170, h: 20, rotation: 0 }, z: 1, source: "layout", props: { style: "heading", align: "left", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] } } });
const big = (id: string) => ({ id, type: "big_number", frame: { x: 20, y: 80, w: 90, h: 30, rotation: 0 }, z: 2, source: "layout", props: { binding: { source: "ghg", metric: "total", years: { last: 1 }, sites: "all" }, measure: "value", label: "tCO₂e total", showDelta: false } });
const templateDoc = (name: string) => ({
  schemaVersion: 2,
  kind: "ghg",
  purpose: "report",
  format: "a4",
  meta: { title: "{{title}}", year: 2025, yearType: "CY", sites: "all", language: "en" },
  design: { templateId: "1", templateVersion: 1, theme: { look: "classic" } },
  pages: [
    { id: "p-cover", kind: "freeform", name: "Cover", background: {}, elements: [text("p-cover.t", `${name} {{period}}`), big("p-cover.total")] },
    { id: "p-s3", kind: "freeform", name: "Scope 3 by category", background: {}, elements: [text("p-s3.t", "Scope 3 by category")] },
  ],
  assets: [],
});

const suggestion = (t: (typeof TEMPLATES)[number], rank: number, aiUsed: boolean) => ({
  templateId: t.id,
  rank,
  template: t,
  readiness: {
    score: 0.9 - rank * 0.2,
    level: rank === 1 ? "ready" : "partial",
    notReportedPages: rank === 1 ? 0 : 6,
    badges: [
      { key: "scope12_months", label: "Scope 1 and 2: 12 of 12 months approved", have: 12, of: 12, status: "ok", notReportedPages: 0 },
      ...(rank === 1 ? [] : [{ key: "scope3_categories", label: "Scope 3: 9 of 15 categories have data → 6 category pages show “Not reported”", have: 9, of: 15, status: "partial", notReportedPages: 6 }]),
    ],
  },
  reasons: aiUsed ? [`${t.name} follows ISO 14064-1 sections a verifier expects`, "Your Scope 1 and 2 months are all approved"] : [],
  pagesToDrop: rank === 1 ? [] : ["p-s3"],
  pagesToAdd: [],
});

async function signIn(page: Page, opts: { aiUsed?: boolean } = {}) {
  const aiUsed = opts.aiUsed ?? true;
  const calls: Call[] = [];
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== APP_PORT && !url.protocol.startsWith("data"),
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const body = method === "GET" ? null : ((request.postDataJSON() as Record<string, unknown> | null) ?? null);
      if (path.includes("/studio/")) calls.push({ method, path, body });
      const json = (b: unknown, status = 200) => route.fulfill({ status, json: b });
      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/kpi/status")) return json({ enabled: false, setup_completed: false });
      if (path.endsWith("/user/reporting-calendar")) return json({ fiscalYearStartMonth: 4, fiscalYearRule: "" });
      if (path.endsWith("/studio/status")) return json({ enabled: true, kinds: { ghg: true, sustainability: false } });
      if (path.endsWith("/studio/templates") && method === "GET") return json(TEMPLATES);
      if (path.endsWith("/studio/templates/suggest") && method === "POST") {
        const shortlist = [TEMPLATES[1], TEMPLATES[0], TEMPLATES[2]].map((t, i) => suggestion(t, i + 1, aiUsed));
        return json({ shortlist, aiUsed, model: aiUsed ? "anthropic/claude" : null, considered: 7 });
      }
      const detail = /\/studio\/templates\/(\d+)$/.exec(path);
      if (detail) {
        const t = TEMPLATES.find((x) => x.id === Number(detail[1]));
        return t ? json({ ...t, doc: templateDoc(t.name) }) : json({ code: "DS_LAYOUT_NOT_FOUND", message: "Not found." }, 404);
      }
      if (path.endsWith("/studio/inputs/prefill")) return json({ keys: [], prefill: {} });
      if (path.endsWith("/studio/brand-kit")) return json({ name: "Midal", logos: { primary: null, onDark: null }, colors: { primary: "#0F5132", accent: "#F59E0B", coverFrom: "#0F5132", coverTo: "#0B3D26" }, defaultLook: "classic", fonts: { heading: null, body: null }, voice: "", palettes: [], canEdit: true, brandControls: false, updatedAt: null });
      if (path.endsWith("/studio/resolve")) {
        const values = ((body?.bindings as unknown[]) ?? []).map(() => ({ source: "ghg", display: "18,940.000", value: 18940, unit: "tCO₂e", approvedAt: "2026-04-12T00:00:00Z" }));
        return json({ values, tokens: [], dataHash: "sha256:x", unavailable: [] });
      }
      if (path.includes("/studio/")) return json({ code: "DS_DOC_NOT_FOUND", message: "Not found." }, 404);
      return json({});
    },
  );
  return calls;
}

test("Help me choose → suggestion cards → Preview with my data → Use this moves to the scope step", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await signIn(page);
  await page.goto("/studio/new?kind=ghg&format=a4&purpose=report&year=2026&yearType=FY&compareYear=2025&siteIds=1");
  await expect(page.getByRole("heading", { name: "New GHG report" })).toBeVisible();
  await page.getByRole("radio", { name: "Help me choose" }).click();
  await expect(page.getByTestId("help-me-choose")).toBeVisible();
  await page.getByRole("radio", { name: "GHG inventory" }).click();
  await page.getByLabel("Anything else?").fill("For our first third-party verification.");
  await page.getByTestId("suggest-submit").click();

  await expect(page.getByTestId("suggest-heading")).toContainText("3 of 7 GHG templates");
  const best = page.getByTestId("suggestion-2");
  await expect(best).toContainText("Best fit");
  await expect(best).toContainText("follows ISO 14064-1");
  await expect(page.getByTestId("suggestion-1")).toContainText("6 category pages show “Not reported”");
  await expect(page.getByTestId("suggestion-1")).toContainText("Could leave out: Scope 3 by category");

  const ask = calls.find((c) => c.method === "POST" && c.path.endsWith("/studio/templates/suggest"));
  expect(ask?.body).toMatchObject({ kind: "ghg", year: 2026, yearType: "FY", sites: [1], brief: { purpose: "ghg_inventory", note: "For our first third-party verification." } });

  await page.getByTestId("suggestion-preview-2").click();
  await expect(page.getByTestId("suggest-preview")).toBeVisible();
  await expect(page.getByTestId("suggest-preview-page")).toHaveText("Page 1 of 2");
  await expect(page.getByTestId("suggest-preview").getByRole("img", { name: "Cover" })).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByTestId("suggest-preview-page")).toHaveText("Page 2 of 2");
  expect(calls.some((c) => c.path.endsWith("/studio/resolve"))).toBe(true);

  await page.getByTestId("suggest-preview-use").click();
  await expect(page.getByLabel("Year", { exact: true })).toBeVisible();
  // Nothing was created yet: suggestion and preview save nothing.
  expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/studio/docs"))).toBe(false);
});

test("without the AI the cards come in rule order with no reasons", async ({ page }) => {
  await signIn(page, { aiUsed: false });
  await page.goto("/studio/new?kind=ghg&year=2026&yearType=FY&siteIds=1");
  await page.getByRole("radio", { name: "Help me choose" }).click();
  await page.getByTestId("suggest-submit").click();
  await expect(page.getByText("Ordered by our rules")).toBeVisible();
  await expect(page.getByLabel("Why it fits")).toHaveCount(0);
  await page.getByTestId("suggestion-use-1").click();
  await expect(page.getByLabel("Year", { exact: true })).toBeVisible();
});

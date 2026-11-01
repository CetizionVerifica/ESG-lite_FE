import { readFileSync } from "node:fs";
import { type Locator, type Page, expect, test } from "@playwright/test";

/**
 * AT-2 · Layouts and Try another template in the editor's AI drawer (`/studio/:id`) on an
 * in-memory API: "Suggest layouts" for page 1 → three options → pick B (ghost preview, nothing
 * saved) → Accept → the page is saved with the new frames as one undo step. Then "Try another
 * template" → the side-by-side compare → Apply → /template-swap/apply with the preview's hash,
 * and the editor's autosave follows the new rev without a conflict. Plus the switch-off path.
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as Doc;

type Frame = { x: number; y: number; w: number; h: number; rotation?: number };
type El = { id: string; type: string; locked?: boolean; templateLocked?: boolean; frame: Frame; props: Record<string, unknown> };
type Pg = { id: string; kind: string; name: string; elements?: El[] };
type Doc = { pages: Pg[]; design?: { templateId: string }; [k: string]: unknown };

const TEMPLATES = [
  { id: 2, companyId: null, kind: "ghg", purpose: "report", format: "a4", name: "ISO 14064-1 inventory · Night", tags: [], version: 1, thumbnailUrl: null, pageCount: 25, slug: "ghg-iso14064-night", family: "ghg-iso14064", look: "night" },
  { id: 4, companyId: null, kind: "ghg", purpose: "summary", format: "a4", name: "One-page summary · Classic", tags: [], version: 1, thumbnailUrl: null, pageCount: 1, slug: "ghg-one-page-classic", family: "ghg-one-page", look: "classic" },
];
const swapped = (doc: Doc, templateId: number): Doc => ({ ...doc, design: { ...(doc.design as object), templateId: String(templateId), templateVersion: 1 } as Doc["design"] });

async function mockApi(page: Page, opts: { studio?: boolean } = {}) {
  const studio = opts.studio ?? true;
  const state = { doc: JSON.parse(JSON.stringify(FIXTURE)) as Doc, rev: 1, patches: [] as Doc[], ai: [] as Record<string, unknown>[], applies: [] as { templateId: number; rev: number; previewHash: string }[] };
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
  const value = () => ({ display: "1,000.000", value: 1000, unit: "tCO₂e", source: "ghg", approvedAt: "2026-04-12T00:00:00.000Z", approvedEntries: 318, series: [{ label: "2025", values: [{ key: "2025", value: 1 }] }] });
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
        state.patches.push(b.doc);
        return json({ id: 1, doc: state.doc, rev: state.rev, status: "draft" });
      }
      if (path.endsWith("/studio/resolve")) {
        const b = request.postDataJSON() as { bindings: unknown[]; tokens: unknown[] };
        return json({ values: b.bindings.map(value), tokens: b.tokens.map(value), dataHash: "h", unavailable: [] });
      }
      if (path.endsWith("/studio/docs/1/ai/usage")) return json({ todayUsd: 0.12, budgetUsd: 5, calls: 3, callBudget: 200, monthUsd: 1.4, monthBudgetUsd: 50 });
      // DS-9 action suggest_layouts: three options that move the page's own elements (locked ones stay).
      if (path.endsWith("/studio/docs/1/ai") && method === "POST") {
        const b = request.postDataJSON() as { action: string; target?: { pageId: string } };
        state.ai.push(b as Record<string, unknown>);
        const pg = state.doc.pages.find((p) => p.id === b.target?.pageId) as Pg;
        const els = pg.elements ?? [];
        const mirror = (e: El): Frame => (e.locked || e.templateLocked ? e.frame : { ...e.frame, x: Math.max(0, 210 - e.frame.x - e.frame.w) });
        const option = (f: (e: El) => Frame) => ({ ...pg, elements: els.map((e) => ({ ...e, frame: f(e) })) });
        const ids = els.map((e) => e.id);
        return json({
          id: `sug_layouts_${state.ai.length}`,
          action: "suggest_layouts",
          model: "anthropic/claude-sonnet-5.5",
          createdAt: "2026-10-20T00:00:00.000Z",
          kind: "pages",
          payload: {
            pages: [option((e) => e.frame), option(mirror), option((e) => e.frame)],
            layoutOptions: [
              { id: "A", name: "Chart + story", layoutSlug: "ghg-inventory/cover", reason: "Keeps the cover as it is.", placedElementIds: ids },
              { id: "B", name: "Big number + table", layoutSlug: "ghg-inventory/cover", reason: "The headline figure leads on the right.", placedElementIds: ids },
              { id: "C", name: "Full-width chart", layoutSlug: "ghg-inventory/cover", reason: "", placedElementIds: ids },
            ],
          },
          sources: [],
        });
      }
      if (path.endsWith("/studio/templates")) return json(TEMPLATES);
      if (path.endsWith("/studio/docs/1/template-swap/preview")) {
        const b = request.postDataJSON() as { templateId: number; rev: number };
        if (b.rev !== state.rev) return json({ code: "DS_VERSION_CONFLICT", message: "Stale", details: { rev: state.rev } }, 409);
        const pages = state.doc.pages.map((p) => ({ pageId: p.id, fromLayoutId: null, toLayoutId: null, status: "kept" }));
        return json({ fromTemplateId: state.doc.design?.templateId, templateId: b.templateId, rev: state.rev, doc: swapped(state.doc, b.templateId), pages, unplaced: [], previewHash: `h:${state.rev}:${b.templateId}` });
      }
      if (path.endsWith("/studio/docs/1/template-swap/apply")) {
        const b = request.postDataJSON() as { templateId: number; rev: number; previewHash: string };
        state.applies.push(b);
        if (b.rev !== state.rev || b.previewHash !== `h:${state.rev}:${b.templateId}`) return json({ code: "DS_VERSION_CONFLICT", message: "Stale", details: { rev: state.rev } }, 409);
        state.doc = swapped(state.doc, b.templateId);
        state.rev += 1;
        return json({ id: 1, doc: state.doc, rev: state.rev, status: "draft" });
      }
      if (path.endsWith("/studio/data")) return json({ kind: "ghg", year: 2025, yearType: "CY", siteIds: [1], groups: [] });
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

const lastSaved = (s: { patches: Doc[] }) => s.patches[s.patches.length - 1];
const frameOf = (d: Doc | undefined, id: string) => d?.pages.find((p) => p.id === "p-cover")?.elements?.find((e) => e.id === id)?.frame;

test.use({ viewport: { width: 1600, height: 1000 } });

async function openAi(page: Page) {
  await page.goto("/studio/1");
  await expect(page.getByTestId("studio-editor")).toBeVisible();
  await page.getByRole("tab", { name: "AI" }).click();
  return page.getByTestId("ai-panel");
}

test("suggest layouts → pick B → Accept saves the page; try another template → compare → Apply", async ({ page }) => {
  const state = await mockApi(page);
  const before = frameOf(state.doc, "p-cover.total") as Frame;
  const panel = await openAi(page);
  const layouts = panel.getByTestId("ai-layouts");
  await expect(layouts).toContainText("Layouts for page 1");
  await layouts.getByRole("button", { name: "Suggest layouts" }).click();
  await expect(layouts.getByRole("list", { name: "Layout options" }).getByRole("listitem")).toHaveCount(3);
  expect(state.ai[0]).toEqual({ action: "suggest_layouts", target: { pageId: "p-cover" } });

  await layouts.getByTestId("layout-option-B").click();
  await expect(layouts.getByTestId("layout-reason")).toContainText("Why B:");
  await expect(page.getByTestId("ai-ghost-p-cover.total")).toBeVisible();
  await page.waitForTimeout(1300);
  expect(state.patches).toHaveLength(0);

  await layouts.getByRole("button", { name: /Accept B/ }).click();
  await expect(page.getByTestId("ai-ghost-p-cover.total")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Undo AI: layout B/ })).toBeVisible();
  await expect.poll(() => frameOf(lastSaved(state), "p-cover.total")?.x, { timeout: 6000 }).toBe(210 - before.x - before.w);
  expect(frameOf(lastSaved(state), "p-cover.bg")).toEqual(frameOf(FIXTURE, "p-cover.bg"));

  const swap = panel.getByTestId("ai-template-swap");
  await swap.getByRole("button", { name: "ISO 14064-1 inventory · Night" }).click();
  const dialog = page.getByRole("dialog", { name: "Try ISO 14064-1 inventory · Night" });
  await expect(dialog.getByTestId("swap-compare")).toBeVisible();
  await expect(dialog.getByRole("img", { name: /now$/ })).toBeVisible();
  await expect(dialog.getByRole("img", { name: /with ISO 14064-1 inventory · Night$/ })).toBeVisible();
  const box = (await dialog.boundingBox()) as { x: number; y: number; width: number; height: number };
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1600);
  await dialog.getByRole("button", { name: "Apply template" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.applies[0]).toMatchObject({ templateId: 2, previewHash: `h:${state.applies[0].rev}:2` });
  expect(state.doc.design?.templateId).toBe("2");
  await expect(page.getByRole("button", { name: /^Undo Template: ISO 14064-1 inventory · Night/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("save-state")).not.toContainText("Changed elsewhere");
});

test.describe("at 1366 × 768", () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  test("the layout options and the compare dialog fit with nothing clipped", async ({ page }) => {
    await mockApi(page);
    const panel = await openAi(page);
    const layouts = panel.getByTestId("ai-layouts");
    await layouts.getByRole("button", { name: "Suggest layouts" }).click();
    const accept = layouts.getByRole("button", { name: /Accept A/ });
    await expect(accept).toBeVisible();
    const inside = async (sel: Locator, outer: { x: number; width: number }) => {
      const b = (await sel.boundingBox()) as { x: number; width: number };
      expect(b.x).toBeGreaterThanOrEqual(outer.x - 0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
    };
    const lay = (await layouts.boundingBox()) as { x: number; width: number };
    await inside(layouts.getByTestId("layout-option-C"), lay);
    await inside(accept, lay);

    await panel.getByTestId("ai-template-swap").getByRole("button", { name: "One-page summary · Classic" }).click();
    const dialog = page.getByRole("dialog", { name: "Try One-page summary · Classic" });
    await expect(dialog.getByTestId("swap-compare")).toBeVisible();
    const apply = dialog.getByRole("button", { name: "Apply template" });
    await apply.scrollIntoViewIfNeeded();
    await expect(apply).toBeInViewport();
    const box = (await dialog.boundingBox()) as { x: number; width: number };
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1366);
  });
});

test("switch off: the layouts panel isn't reachable", async ({ page }) => {
  await mockApi(page, { studio: false });
  await page.goto("/studio/1");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("ai-layouts")).toHaveCount(0);
});

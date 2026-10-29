import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";

/**
 * DS-9 · the AI assistant in the editor (`/studio/:id`) on an in-memory API
 * with a recorded model answer: select the summary text, ask "Write the
 * executive summary" → a card with a diff → Accept → the box's text has data
 * chips with the server's values and is saved as AI-written, unreviewed.
 * Discard leaves the page unchanged (no save). Plus the switch-off path.
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as Doc;

type El = { id: string; type: string; source?: string; reviewed?: boolean; frame: { x: number; y: number; w: number; h: number }; props: Record<string, unknown> };
type Pg = { id: string; kind: string; name: string; elements?: El[] };
type Doc = { pages: Pg[]; [k: string]: unknown };

// The server's display strings: tCO₂e figures with 3 decimals (#209, src/studio/sources/format.ts).
const DISPLAY: Record<string, string> = { total: "18,940.000", scope1: "12,480.000", scope2_location: "5,210.000", scope3: "1,250.000" };
const SUMMARY_TEXT = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Total emissions were " },
        { type: "data", attrs: { binding: { source: "ghg", metric: "total", years: { last: 1 }, sites: "all" }, measure: "value" } },
        { type: "text", text: " tCO₂e, with Scope 3 at " },
        { type: "data", attrs: { binding: { source: "ghg", metric: "scope3", years: { last: 1 }, sites: "all" }, measure: "value" } },
        { type: "text", text: " tCO₂e." },
      ],
    },
  ],
};

async function mockApi(page: Page, opts: { studio?: boolean } = {}) {
  const studio = opts.studio ?? true;
  const state = { doc: JSON.parse(JSON.stringify(FIXTURE)) as Doc, rev: 1, patches: [] as Doc[], chats: [] as Record<string, unknown>[] };
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
  const value = (b: { source: string; metric?: string }) => {
    const display = (b.source === "ghg" && b.metric && DISPLAY[b.metric]) || "1,000.000";
    return { display, value: Number(display.replace(/,/g, "")), unit: "tCO₂e", source: b.source, approvedAt: "2026-04-12T00:00:00.000Z", approvedEntries: 318, series: [{ label: "2025", values: [{ key: "2025", value: 1 }] }] };
  };
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
        const b = request.postDataJSON() as { bindings: { source: string; metric?: string }[]; tokens: { attrs: { binding: { source: string; metric?: string } } }[] };
        return json({ values: b.bindings.map(value), tokens: b.tokens.map((t) => value(t.attrs.binding)), dataHash: "h", unavailable: [] });
      }
      if (path.endsWith("/studio/docs/1/ai/usage")) return json({ todayUsd: 0.12, budgetUsd: 5, calls: 3, callBudget: 200, monthUsd: 1.4, monthBudgetUsd: 50 });
      if (path.endsWith("/studio/docs/1/ai/chat")) {
        const b = request.postDataJSON() as { selection?: { pageId: string; elementIds: string[] } };
        state.chats.push(b as Record<string, unknown>);
        const pg = state.doc.pages.find((p) => p.id === b.selection?.pageId);
        const el = pg?.elements?.find((e) => e.id === b.selection?.elementIds[0]);
        // The recorded model answer, as the server turns it into chips (never typed numbers).
        const suggestion = {
          id: "sug_e2e",
          action: "ghg_exec_summary",
          model: "anthropic/claude-sonnet-5.5",
          createdAt: "2026-10-20T00:00:00.000Z",
          kind: "text",
          payload: { text: SUMMARY_TEXT, elements: el ? [{ ...el, source: "ai", reviewed: false, props: { ...el.props, doc: SUMMARY_TEXT } }] : [] },
          sources: [
            { source: "ghg", metric: "total", year: 2025 },
            { source: "ghg", metric: "scope3", year: 2025 },
          ],
        };
        return json({ reply: "Here's a draft of the executive summary from your approved data.", suggestions: [suggestion] });
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
const bodyOf = (d: Doc | undefined) => d?.pages.find((p) => p.id === "p-summary")?.elements?.find((e) => e.id === "p-summary.body");

test.use({ viewport: { width: 1600, height: 1000 } });

async function selectSummaryAndAsk(page: Page) {
  await page.goto("/studio/1");
  await expect(page.getByTestId("studio-editor")).toBeVisible();
  const summary = page.getByTestId("overlay-p-summary");
  await summary.scrollIntoViewIfNeeded();
  const box = (await summary.boundingBox())!;
  const zoom = Number((await page.getByTestId("zoom-value").textContent())!.replace("%", "")) / 100;
  const k = (96 / 25.4) * zoom;
  // The summary text sits at 20,40 (170 × 40 mm).
  await page.mouse.click(box.x + 100 * k, box.y + 60 * k);
  await expect(page.getByTestId("context-toolbar")).toHaveAttribute("data-toolbar", "text");
  await page.getByRole("tab", { name: "AI" }).click();
  const panel = page.getByTestId("ai-panel");
  await expect(panel.getByTestId("ai-about")).toContainText("page 2");
  await panel.getByRole("button", { name: "Write the executive summary" }).click();
  const card = panel.getByTestId("ai-suggestion");
  await expect(card).toBeVisible();
  return { panel, card };
}

test("ask for the executive summary → a card with a diff → Accept → the text has chips", async ({ page }) => {
  const state = await mockApi(page);
  const { card } = await selectSummaryAndAsk(page);
  await expect(card.getByTestId("ai-diff")).toContainText("Total emissions were ⟦18,940.000⟧");
  await expect(card.getByTestId("ai-diff").locator("del").first()).toBeVisible();
  await expect(card).toContainText("Based on: Total emissions 2025 · Scope 3 2025");
  expect(state.chats[0]).toMatchObject({ selection: { pageId: "p-summary", elementIds: ["p-summary.body"] } });
  expect(state.patches).toHaveLength(0);

  await card.getByRole("button", { name: "Accept" }).click();
  await expect(card).toHaveAttribute("data-status", "accepted");
  const chips = page.locator('[data-sheet-host="p-summary"] [data-el-id="p-summary.body"] .ds-chip');
  await expect(chips).toHaveText(["18,940.000", "1,250.000"]);
  await expect(page.getByRole("button", { name: /^Undo AI: Executive summary/ })).toBeVisible();
  await expect.poll(() => bodyOf(lastSaved(state))?.reviewed, { timeout: 6000 }).toBe(false);
  const saved = bodyOf(lastSaved(state))!;
  expect(saved.source).toBe("ai");
  expect(JSON.stringify(saved.props.doc)).toContain('"metric":"scope3"');
});

test("Discard leaves the page unchanged", async ({ page }) => {
  const state = await mockApi(page);
  const before = JSON.stringify(bodyOf(state.doc));
  const { card } = await selectSummaryAndAsk(page);
  await card.getByRole("button", { name: "Preview on page" }).click();
  await expect(page.getByTestId("ai-ghost-p-summary.body")).toBeVisible();
  await card.getByRole("button", { name: "Discard" }).click();
  await expect(card).toHaveAttribute("data-status", "discarded");
  await expect(page.getByTestId("ai-ghost-p-summary.body")).toHaveCount(0);
  await expect(page.locator('[data-sheet-host="p-summary"] [data-el-id="p-summary.body"]')).toContainText("Scope 1 emissions were");
  await page.waitForTimeout(1500);
  expect(state.patches).toHaveLength(0);
  expect(JSON.stringify(bodyOf(state.doc))).toBe(before);
});

test("switch off: the AI panel isn't reachable", async ({ page }) => {
  await mockApi(page, { studio: false });
  await page.goto("/studio/1");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("ai-panel")).toHaveCount(0);
});

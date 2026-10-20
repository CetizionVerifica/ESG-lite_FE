import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";

/**
 * DS-7 · text and flow in the editor (`/studio/:id`) on an in-memory API:
 * double-click a heading, type `{{scope`, pick Scope 1 → a chip with the
 * server's value; delete the chip; undo brings it back; Esc commits and the
 * autosaved doc carries the chip. A flow page opens its settings in the Text
 * drawer and they are saved on the section. Plus the switch-off path.
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as Doc;

type El = { id: string; type: string; frame: { x: number; y: number; w: number; h: number }; props: Record<string, unknown> };
type Pg = { id: string; kind: string; name: string; elements?: El[]; options?: Record<string, unknown> };
type Doc = { pages: Pg[]; [k: string]: unknown };

const DISPLAY: Record<string, string> = { total: "18,940", scope1: "12,480", scope2_location: "5,210" };

async function mockApi(page: Page, opts: { studio?: boolean } = {}) {
  const studio = opts.studio ?? true;
  const state = { doc: JSON.parse(JSON.stringify(FIXTURE)) as Doc, rev: 1, patches: [] as Doc[] };
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
    const display = (b.source === "ghg" && b.metric && DISPLAY[b.metric]) || "1,000";
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
  return state;
}

const lastSaved = (s: { patches: Doc[] }) => s.patches[s.patches.length - 1];
const pageOf = (d: Doc | undefined, id: string) => d?.pages.find((p) => p.id === id);

test.use({ viewport: { width: 1600, height: 1000 } });

test("type {{scope, pick Scope 1 → a chip with the value; delete it; undo; Esc saves it", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/studio/1");
  await expect(page.getByTestId("studio-editor")).toBeVisible();
  const summary = page.getByTestId("overlay-p-summary");
  await summary.scrollIntoViewIfNeeded();
  const box = (await summary.boundingBox())!;
  const zoom = Number((await page.getByTestId("zoom-value").textContent())!.replace("%", "")) / 100;
  const k = (96 / 25.4) * zoom;
  // The heading sits at 20,20 (170 × 15 mm).
  await page.mouse.dblclick(box.x + 60 * k, box.y + 27 * k);
  const editing = page.getByTestId("text-edit-overlay");
  await expect(editing).toBeVisible();
  const text = editing.locator(".ProseMirror");
  await expect(text).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type(" {{scope");
  const picker = page.getByRole("dialog", { name: "Insert data value" });
  await expect(picker).toBeVisible();
  await picker.getByTestId("pick-scope1").click();
  const chip = editing.getByTestId("data-chip");
  await expect(chip).toHaveText("12,480");
  await expect(text).not.toContainText("{{");

  // Delete the chip (the space after it, then the chip), then undo.
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(chip).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(chip).toHaveText("12,480");

  // Esc commits one step; the sheet prints the chip's value and the doc autosaves.
  await page.keyboard.press("Escape");
  await expect(editing).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Undo Edit text/ })).toBeVisible();
  await expect(page.locator('[data-sheet-host="p-summary"] [data-el-id="p-summary.heading"] .ds-chip')).toHaveText("12,480");
  await expect
    .poll(() => JSON.stringify(pageOf(lastSaved(state), "p-summary")?.elements?.find((e) => e.id === "p-summary.heading")?.props.doc ?? null), { timeout: 6000 })
    .toContain('"metric":"scope1"');
});

test("a flow page opens its settings in the Text drawer", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/studio/1");
  await expect(page.getByTestId("studio-editor")).toBeVisible();
  const slot = page.locator('[data-page-slot="p-categories"]');
  await slot.scrollIntoViewIfNeeded();
  const b = (await slot.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  const panel = page.getByTestId("flow-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("checkbox", { name: /Category 1 · Purchased goods and services/ }).uncheck();
  await panel.getByRole("switch", { name: "Show method" }).click();
  await expect
    .poll(() => {
      const o = pageOf(lastSaved(state), "p-categories")?.options;
      return o ? JSON.stringify({ categories: o.categories, showMethod: o.showMethod, showDq: o.showDq }) : null;
    }, { timeout: 6000 })
    .toBe(JSON.stringify({ categories: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], showMethod: false, showDq: true }));
});

test("switch off: the editor isn't reachable", async ({ page }) => {
  await mockApi(page, { studio: false });
  await page.goto("/studio/1");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("text-edit-overlay")).toHaveCount(0);
});

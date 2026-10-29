import { readFileSync } from "node:fs";
import { type Locator, type Page, expect, test } from "@playwright/test";

/**
 * Design Studio Pro (AT-2, PE-1, PE-2 merged) · the editor's context toolbar
 * and every popover it opens fit on screen with nothing clipped, at 1366 × 768
 * and in the editor's full screen (1366 × 768 and 1920 × 1080). For the cover
 * photo (frame toolbar, PE-1 photo tools) and the summary heading (text
 * toolbar, PE-2 Font / Effects / Find): every toolbar control sits inside the
 * toolbar row (the row is overflow-hidden, so a control past its edge is
 * clipped), and every popover opened from it (aria-haspopup, drawn through the
 * PopoverLayer) lies inside the window. A dropdown clipped by the toolbar was
 * a past bug. Also the find panel and the AI drawer's layouts.
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as Doc;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwHwyBNAMDA8N/ABf1A/2kQ5YkAAAAAElFTkSuQmCC";

type El = { id: string; type: string; templateLocked?: boolean; frame: { x: number; y: number; w: number; h: number }; props: Record<string, unknown> };
type Pg = { id: string; kind: string; name: string; elements?: El[] };
type Doc = { pages: Pg[]; [k: string]: unknown };
type Box = { x: number; y: number; width: number; height: number };

const KIT = { name: "ACME", logos: { primary: null, onDark: null }, colors: { primary: "#0f5132", accent: "#f59e0b", coverFrom: "#0d1526", coverTo: "#0f5132" }, defaultLook: "classic", fonts: { heading: null, body: null }, voice: "", palettes: [], canEdit: true, brandControls: false, updatedAt: null };

async function mockApi(page: Page) {
  const doc = JSON.parse(JSON.stringify(FIXTURE)) as Doc;
  delete doc.pages.find((p) => p.id === "p-cover")!.elements!.find((e) => e.id === "p-cover.bg")!.templateLocked;
  let rev = 1;
  const asset = { id: "a-plant", kind: "image", w: 1200, h: 800, alt: "Plant", folder: null, url: PNG, bytes: 100, mime: "image/png", sha256: "a".repeat(64), createdAt: "2026-10-20T00:00:00.000Z" };
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
      if (path.endsWith("/studio/docs/1") && method === "GET") return json({ id: 1, doc, rev, status: "draft" });
      if (path.endsWith("/studio/docs/1") && method === "PATCH") {
        rev += 1;
        return json({ id: 1, doc: (request.postDataJSON() as { doc: Doc }).doc, rev, status: "draft" });
      }
      if (path.endsWith("/studio/resolve")) {
        const b = request.postDataJSON() as { bindings: unknown[]; tokens: unknown[] };
        const v = { display: "1,000.000", value: 1000, unit: "tCO₂e", source: "ghg", approvedAt: "2026-04-12T00:00:00.000Z", series: [{ label: "2025", values: [{ key: "2025", value: 1 }] }] };
        return json({ values: b.bindings.map(() => v), tokens: b.tokens.map(() => v), dataHash: "h", unavailable: [] });
      }
      if (path.endsWith("/studio/docs/1/ai/usage")) return json({ todayUsd: 0, budgetUsd: 5, calls: 0, callBudget: 200, monthUsd: 0, monthBudgetUsd: 50 });
      if (path.endsWith("/studio/brand-kit/fonts")) return json({ fonts: [], canEdit: true });
      if (path.endsWith("/studio/brand-kit")) return json(KIT);
      if (path.endsWith("/studio/templates")) return json([]);
      if (path.endsWith("/studio/data")) return json({ kind: "ghg", year: 2025, yearType: "CY", siteIds: [1], groups: [] });
      if (path.endsWith("/studio/assets")) return json([asset]);
      if (path.endsWith("/studio/layouts")) return json([]);
      if (path.endsWith("/studio/elements")) return json([]);
      if (path.includes("/studio/fonts/")) return route.fulfill({ status: 404, body: "" });
      return json({});
    },
  );
}

function inside(box: Box | null, outer: Box, what: string) {
  expect(box, `${what} has a box`).not.toBeNull();
  const b = box!;
  expect(b.x, `${what} left edge`).toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(b.y, `${what} top edge`).toBeGreaterThanOrEqual(outer.y - 0.5);
  expect(b.x + b.width, `${what} right edge`).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
  expect(b.y + b.height, `${what} bottom edge`).toBeLessThanOrEqual(outer.y + outer.height + 0.5);
}

async function openEditor(page: Page, fullScreen: boolean) {
  await mockApi(page);
  await page.goto("/studio/1");
  await expect(page.getByTestId("studio-editor")).toBeVisible();
  if (fullScreen) {
    await page.getByRole("button", { name: "Full screen" }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  }
}

async function clickAt(page: Page, pageId: string, xMm: number, yMm: number) {
  const overlay = page.getByTestId(`overlay-${pageId}`);
  await overlay.scrollIntoViewIfNeeded();
  const box = (await overlay.boundingBox())!;
  const zoom = Number((await page.getByTestId("zoom-value").textContent())!.replace("%", "")) / 100;
  const k = (96 / 25.4) * zoom;
  await page.mouse.click(box.x + xMm * k, box.y + yMm * k);
}

/** Every visible control inside the overflow-hidden toolbar row, and every popover it opens, on screen. */
async function checkToolbar(page: Page, kind: string) {
  const vp = page.viewportSize()!;
  const screen = { x: 0, y: 0, width: vp.width, height: vp.height };
  const bar = page.getByTestId("context-toolbar");
  await expect(bar).toHaveAttribute("data-toolbar", kind);
  const barBox = (await bar.boundingBox())!;
  inside(barBox, screen, `${kind} toolbar`);
  const controls = bar.locator("button, select, input").filter({ visible: true });
  const n = await controls.count();
  expect(n).toBeGreaterThan(3);
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i);
    inside(await c.boundingBox(), barBox, `${kind} toolbar control "${(await c.getAttribute("aria-label")) ?? (await c.textContent())?.trim()}"`);
  }
  const triggers = bar.locator("[aria-haspopup]:not([disabled])").filter({ visible: true });
  const t = await triggers.count();
  for (let i = 0; i < t; i++) {
    const trigger = triggers.nth(i);
    const name = (await trigger.getAttribute("aria-label")) ?? (await trigger.textContent())?.trim() ?? `#${i}`;
    await trigger.click();
    const popup = await openedPopup(page, trigger);
    if (popup) {
      inside(await popup.boundingBox(), screen, `${kind} popover "${name}"`);
      await page.keyboard.press("Escape");
      await expect(popup).toBeHidden();
    }
    await expect(bar).toHaveAttribute("data-toolbar", kind);
  }
  return t;
}

async function openedPopup(page: Page, trigger: Locator): Promise<Locator | null> {
  const id = await trigger.getAttribute("aria-controls");
  if (id) {
    const el = page.locator(`[id="${id}"]`);
    await expect(el).toBeVisible();
    return el;
  }
  const menu = page.locator("[role=menu], [role=listbox], [role=dialog]").filter({ visible: true }).last();
  return (await menu.count()) ? menu : null;
}

const SIZES = [
  { name: "1366 × 768", width: 1366, height: 768, fullScreen: false },
  { name: "1366 × 768 full screen", width: 1366, height: 768, fullScreen: true },
  { name: "1920 × 1080 full screen", width: 1920, height: 1080, fullScreen: true },
];

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("photo toolbar (PE-1): every control and popover on screen", async ({ page }) => {
      await openEditor(page, size.fullScreen);
      await clickAt(page, "p-cover", 100, 40);
      const opened = await checkToolbar(page, "frame");
      expect(opened).toBeGreaterThan(0);
    });

    test("text toolbar (PE-2): every control and popover on screen; find panel too", async ({ page }) => {
      await openEditor(page, size.fullScreen);
      await clickAt(page, "p-summary", 40, 27);
      await checkToolbar(page, "text");
      await page.getByTestId("text-effects").click();
      const fx = page.getByRole("dialog", { name: "Text effects" });
      await fx.getByRole("button", { name: /Shadow/ }).click();
      inside(await fx.boundingBox(), { x: 0, y: 0, width: size.width, height: size.height }, "Effects with the shadow sliders");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Control+Shift+F");
      const find = page.getByRole("dialog", { name: "Find and replace" });
      await expect(find).toBeVisible();
      inside(await find.boundingBox(), { x: 0, y: 0, width: size.width, height: size.height }, "Find and replace");
    });

    test("AI drawer (AT-2): layouts and template choices on screen", async ({ page }) => {
      await openEditor(page, size.fullScreen);
      await clickAt(page, "p-summary", 100, 60);
      await page.getByRole("tab", { name: "AI" }).click();
      const panel = page.getByTestId("ai-panel");
      await expect(panel).toBeVisible();
      inside(await panel.boundingBox(), { x: 0, y: 0, width: size.width, height: size.height }, "AI drawer");
    });
  });
}

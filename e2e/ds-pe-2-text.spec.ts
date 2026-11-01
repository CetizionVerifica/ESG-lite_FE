import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";

/**
 * PE-2 · text effects, brand fonts, find and replace on an in-memory API:
 *   - the editor (`/studio/1`): Effects → Shadow, then Lift (they exclude each
 *     other), drawn by the renderer and autosaved; the uploaded brand font in
 *     the Font picker; ⌘⇧F find and replace (Replace all keeps the chips, one undo);
 *   - at 1366 × 768 the Effects popover and the find panel sit inside the window;
 *   - the brand kit (`/studio/brand-kit`): a Manager uploads a font with the
 *     licence tick (multipart body checked) and it is listed;
 *   - the switch off.
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as Doc;

type El = { id: string; type: string; frame: { x: number; y: number; w: number; h: number }; props: Record<string, unknown> };
type Pg = { id: string; kind: string; name: string; elements?: El[] };
type Doc = { pages: Pg[]; [k: string]: unknown };

const MIDAL = {
  id: 1,
  ref: "custom:1",
  family: "Midal Sans",
  weights: [400],
  styles: ["normal"],
  assetIds: ["font-1"],
  files: [{ assetId: "font-1", weight: 400, style: "normal", format: "woff2", bytes: 8, url: "/studio/brand-kit/fonts/1/files/font-1" }],
  licenceConfirmedBy: 12,
  licenceConfirmedAt: "2026-10-20T00:00:00.000Z",
  createdAt: "2026-10-20T00:00:00.000Z",
};
const KIT = {
  name: "ACME",
  logos: { primary: null, onDark: null },
  colors: { primary: "#0f5132", accent: "#f59e0b", coverFrom: "#0d1526", coverTo: "#0f5132" },
  defaultLook: "classic",
  fonts: { heading: null, body: null },
  voice: "",
  palettes: [],
  canEdit: true,
  brandControls: false,
  updatedAt: null,
};

async function mockApi(page: Page, opts: { studio?: boolean; fonts?: (typeof MIDAL)[] } = {}) {
  const studio = opts.studio ?? true;
  const state = { doc: JSON.parse(JSON.stringify(FIXTURE)) as Doc, rev: 1, patches: [] as Doc[], fonts: [...(opts.fonts ?? [])], uploads: [] as string[] };
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
    async (route) => {
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
        const v = { display: "1,000.000", value: 1000, unit: "tCO₂e", source: "ghg", approvedAt: "2026-04-12T00:00:00.000Z", series: [{ label: "2025", values: [{ key: "2025", value: 1 }] }] };
        return json({ values: b.bindings.map(() => v), tokens: b.tokens.map(() => v), dataHash: "h", unavailable: [] });
      }
      if (path.endsWith("/studio/brand-kit/fonts") && method === "GET") return json({ fonts: state.fonts, canEdit: true });
      if (path.endsWith("/studio/brand-kit/fonts") && method === "POST") {
        state.uploads.push(request.postDataBuffer()?.toString("latin1") ?? "");
        state.fonts.push(MIDAL);
        return json(MIDAL, 201);
      }
      if (path.includes("/studio/brand-kit/fonts/") && path.includes("/files/")) return route.fulfill({ status: 404, body: "" });
      if (path.endsWith("/studio/brand-kit")) return json(KIT);
      if (path.endsWith("/studio/data")) return json({ kind: "ghg", year: 2025, yearType: "CY", siteIds: [1], groups: [] });
      if (path.endsWith("/studio/assets")) return json([]);
      if (path.endsWith("/studio/layouts")) return json([]);
      if (path.endsWith("/studio/elements")) return json([]);
      if (path.includes("/studio/fonts/")) return route.fulfill({ status: 404, body: "" });
      return json({});
    },
  );
  return state;
}

const lastSaved = (s: { patches: Doc[] }) => s.patches[s.patches.length - 1];
const elOf = (d: Doc | undefined, id: string) => d?.pages.find((p) => p.id === "p-summary")?.elements?.find((e) => e.id === id);
const sheetEl = (page: Page, id: string) => page.locator(`[data-sheet-host="p-summary"] [data-el-id="${id}"]`);

async function selectHeading(page: Page) {
  await page.goto("/studio/1");
  await expect(page.getByTestId("studio-editor")).toBeVisible();
  const summary = page.getByTestId("overlay-p-summary");
  await summary.scrollIntoViewIfNeeded();
  const box = (await summary.boundingBox())!;
  const zoom = Number((await page.getByTestId("zoom-value").textContent())!.replace("%", "")) / 100;
  const k = (96 / 25.4) * zoom;
  // The heading sits at 20,20 (170 × 15 mm).
  await page.mouse.click(box.x + 40 * k, box.y + 27 * k);
  await expect(page.getByTestId("context-toolbar")).toHaveAttribute("data-toolbar", "text");
}

const inViewport = async (page: Page, box: { x: number; y: number; width: number; height: number } | null) => {
  const vp = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 0.5);
};

test.describe("editor", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("Effects: Shadow, then Lift replaces it; drawn by the renderer and autosaved", async ({ page }) => {
    const state = await mockApi(page);
    await selectHeading(page);
    await page.getByTestId("text-effects").click();
    const panel = page.getByRole("dialog", { name: "Text effects" });
    await panel.getByRole("button", { name: /Shadow/ }).click();
    await expect(sheetEl(page, "p-summary.heading")).toHaveAttribute("data-effects", "shadow");
    await panel.getByRole("button", { name: /Lift/ }).click();
    await expect(sheetEl(page, "p-summary.heading")).toHaveAttribute("data-effects", "lift");
    await expect.poll(() => elOf(lastSaved(state), "p-summary.heading")?.props.effects, { timeout: 6000 }).toEqual({ lift: { intensity: 50 } });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Undo Lift/ }).click();
    await expect(sheetEl(page, "p-summary.heading")).toHaveAttribute("data-effects", "shadow");
  });

  test("Font: an uploaded brand font is listed and the box uses it", async ({ page }) => {
    const state = await mockApi(page, { fonts: [MIDAL] });
    await selectHeading(page);
    const picker = page.getByLabel("Font", { exact: true });
    await expect(picker.locator("option", { hasText: "Midal Sans (uploaded)" })).toHaveCount(1);
    await picker.selectOption("custom:1");
    await expect(sheetEl(page, "p-summary.heading")).toHaveAttribute("data-font", "custom:1");
    await expect.poll(() => elOf(lastSaved(state), "p-summary.heading")?.props.font, { timeout: 6000 }).toBe("custom:1");
  });

  test("⌘⇧F: Replace all changes the words, keeps the chips, and is one undo step", async ({ page }) => {
    const state = await mockApi(page);
    await page.goto("/studio/1");
    await expect(page.getByTestId("studio-editor")).toBeVisible();
    await page.getByTestId("overlay-p-summary").scrollIntoViewIfNeeded();
    await page.keyboard.press("Control+Shift+F");
    const panel = page.getByRole("dialog", { name: "Find and replace" });
    await expect(panel.getByRole("textbox", { name: "Find", exact: true })).toBeFocused();
    await panel.getByRole("textbox", { name: "Find", exact: true }).fill("versus");
    await expect(page.getByTestId("find-summary")).toContainText("1 match on 1 page");
    await panel.getByLabel("Replace with").fill("against");
    await panel.getByRole("button", { name: "Replace all" }).click();
    await expect(sheetEl(page, "p-summary.body")).toContainText("against 2024");
    await expect(sheetEl(page, "p-summary.body").locator(".ds-chip")).toHaveCount(2);
    await expect.poll(() => JSON.stringify(elOf(lastSaved(state), "p-summary.body")?.props.doc ?? ""), { timeout: 6000 }).toContain("against 2024");
    await panel.getByRole("button", { name: "Close find and replace" }).click();
    await page.getByRole("button", { name: /^Undo Replace all: 1/ }).click();
    await expect(sheetEl(page, "p-summary.body")).toContainText("versus 2024");
  });
});

test.describe("1366 × 768", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("the Effects popover and the find panel fit in the window", async ({ page }) => {
    await mockApi(page);
    await selectHeading(page);
    await page.getByTestId("text-effects").click();
    const panel = page.getByRole("dialog", { name: "Text effects" });
    await panel.getByRole("button", { name: /Shadow/ }).click();
    await panel.getByRole("button", { name: /Highlight/ }).click();
    await inViewport(page, await panel.boundingBox());
    await page.keyboard.press("Escape");
    await page.getByTestId("find-replace-button").click();
    await inViewport(page, await page.getByRole("dialog", { name: "Find and replace" }).boundingBox());
  });
});

test("brand kit: a Manager uploads a font with the licence tick", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/studio/brand-kit");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Brand fonts" }) });
  await expect(section.getByText(/No uploaded fonts yet/)).toBeVisible();
  await section.locator('input[type="file"]').setInputFiles({ name: "MidalSans-Regular.woff2", mimeType: "font/woff2", buffer: Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]) });
  await expect(section.getByLabel("Font family")).toHaveValue("Midal Sans");
  await section.getByRole("button", { name: "Upload font" }).click();
  await expect(section.getByText("Confirm that your company holds a licence to embed this font in PDFs.")).toBeVisible();
  expect(state.uploads).toHaveLength(0);
  await section.getByLabel("We hold a licence that allows embedding this font in PDFs.").check();
  await section.getByRole("button", { name: "Upload font" }).click();
  await expect(section.getByTestId("brand-font-1")).toContainText("Midal Sans");
  expect(state.uploads[0]).toContain('name="licenceConfirmed"\r\n\r\ntrue');
  expect(state.uploads[0]).toContain('filename="MidalSans-Regular.woff2"');
});

test("switch off: the brand kit isn't reachable", async ({ page }) => {
  await mockApi(page, { studio: false });
  await page.goto("/studio/brand-kit");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Brand fonts" })).toHaveCount(0);
});

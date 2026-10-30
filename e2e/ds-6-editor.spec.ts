import { readFileSync } from "node:fs";
import { type Locator, type Page, expect, test } from "@playwright/test";

/**
 * DS-6 · the editor (`/studio/:id`) on an in-memory API: add a frame from
 * Elements, drop an image into it, crop it, align it to the page centre, tidy
 * three tiles, reorder pages in grid view, add a ruler guide, then undo the
 * lot — the autosaved doc is the original again. Plus the width gate and the
 * switch-off path.
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as Doc;
const IMAGE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#2a7"/><circle cx="150" cy="100" r="60" fill="#fd0"/></svg>')}`;

type Frame = { x: number; y: number; w: number; h: number; rotation: number };
type El = { id: string; type: string; frame: Frame; props: Record<string, unknown> };
type Pg = { id: string; kind: string; name: string; elements?: El[]; guides?: { axis: string; mm: number }[] };
type Doc = { pages: Pg[]; assets: unknown[]; [k: string]: unknown };

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
        const b = request.postDataJSON() as { bindings: { source: string }[]; tokens: unknown[] };
        const v = (i: number) => ({ display: (1000 + i * 111).toLocaleString("en-GB", { minimumFractionDigits: 3, maximumFractionDigits: 3 }), value: 1000 + i * 111, unit: "tCO₂e", source: "ghg", approvedAt: "2026-04-12T00:00:00.000Z", series: [{ label: "2025", values: [{ key: "2025", value: 1000 + i * 111 }] }] });
        return json({ values: b.bindings.map((_, i) => v(i)), tokens: b.tokens.map((_, i) => v(i)), dataHash: "h", unavailable: [] });
      }
      if (path.endsWith("/studio/assets")) return json([{ id: "a-plant", kind: "image", w: 2400, h: 1600, alt: "The plant at dawn", folder: null, url: IMAGE, bytes: 1, mime: "image/svg+xml" }]);
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
const pageOf = (d: Doc, id: string) => d.pages.find((p) => p.id === id) as Pg;

/** A point on a page overlay, in page mm. */
async function pointOn(page: Page, overlay: Locator, x: number, y: number) {
  const box = (await overlay.boundingBox())!;
  const zoom = Number((await page.getByTestId("zoom-value").textContent())!.replace("%", "")) / 100;
  const k = (96 / 25.4) * zoom;
  return { x: box.x + x * k, y: box.y + y * k };
}

test.use({ viewport: { width: 1600, height: 1000 } });

test("frame, image, crop, align, tidy, grid reorder, guide — then undo the lot", async ({ page }) => {
  const state = await mockApi(page);
  await page.goto("/studio/1");
  await expect(page.getByTestId("studio-editor")).toBeVisible();
  const cover = page.getByTestId("overlay-p-cover");
  await expect(cover).toBeVisible();
  // Zoom out so the whole cover is on screen.
  await page.getByRole("slider", { name: "Zoom" }).fill("45");
  await expect(page.getByTestId("zoom-value")).toHaveText("45%");

  // 1. A frame from Elements lands at the page centre, selected.
  await page.getByRole("tab", { name: "Elements" }).click();
  await page.getByRole("button", { name: "Square frame" }).click();
  await expect(page.getByTestId("context-toolbar")).toHaveAttribute("data-toolbar", "frame");

  // 2. Drop an image from Uploads onto it.
  await page.getByRole("tab", { name: "Uploads" }).click();
  const centre = await pointOn(page, cover, 105, 148.5);
  await page.getByRole("button", { name: "Image: The plant at dawn" }).dragTo(cover, { targetPosition: { x: centre.x - (await cover.boundingBox())!.x, y: centre.y - (await cover.boundingBox())!.y } });
  await expect(page.getByRole("button", { name: "Replace" })).toBeVisible();
  await expect.poll(() => cover.locator("..").locator("[data-sheet-host] img").count()).toBeGreaterThan(0);

  // 3. Crop: drag the picture inside the frame, then Done.
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  await expect(page.getByTestId("crop-box")).toBeVisible();
  const c = await pointOn(page, cover, 105, 148.5);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 8, c.y, { steps: 4 });
  await page.mouse.move(c.x + 20, c.y, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("crop-box")).toHaveCount(0);

  // 4. Nudge it off-centre, then align it to the page centre.
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.getByRole("button", { name: "Position" }).click();
  await page.getByRole("button", { name: "Align centre to page" }).click();
  await expect(page.getByRole("textbox", { name: "X", exact: true })).toHaveValue("75");

  // 5. Three tiles at uneven spacing, tidied.
  await page.getByRole("button", { name: "Close position" }).click();
  for (const shift of [-12, 0, 6]) {
    await page.keyboard.press("r");
    for (let i = 0; i < Math.abs(shift); i++) await page.keyboard.press(shift < 0 ? "Shift+ArrowLeft" : "Shift+ArrowRight");
    for (let i = 0; i < 16; i++) await page.keyboard.press("Shift+ArrowDown");
  }
  // Shift-click the three rectangles (centres at x = 45, 105, 135 mm; y = 228.5 mm).
  for (const [i, x] of [45, 105, 135].entries()) {
    const p = await pointOn(page, cover, x, 228.5);
    if (i === 1) await page.keyboard.down("Shift");
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("multi-box")).toBeVisible();
  await page.getByRole("button", { name: "Position" }).click();
  await page.getByRole("button", { name: "Tidy up" }).click();
  await expect.poll(() => state.patches.length, { timeout: 5000 }).toBeGreaterThan(0);
  await expect
    .poll(
      () => {
        const d = lastSaved(state);
        const rects = (pageOf(d, "p-cover").elements ?? []).filter((e) => e.type === "shape").map((e) => e.frame).sort((a, b) => a.x - b.x);
        if (rects.length !== 3) return "not yet";
        const g1 = Math.round((rects[1].x - (rects[0].x + rects[0].w)) * 10) / 10;
        const g2 = Math.round((rects[2].x - (rects[1].x + rects[1].w)) * 10) / 10;
        return g1 === g2 ? "equal" : `${g1} vs ${g2}`;
      },
      { timeout: 5000 },
    )
    .toBe("equal");

  // 6. Grid view: drag the last page to the front.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Alt+Digit3");
  await expect(page.getByTestId("grid-view")).toBeVisible();
  await page.getByTestId("grid-page-p-factors").dragTo(page.getByTestId("grid-page-p-cover"));
  await expect(page.getByTestId("grid-view").getByRole("button", { name: /^Page 1: Emission factors/ })).toBeVisible();
  await page.getByRole("button", { name: "Back to editing" }).click();

  // 7. A guide dragged from the top ruler onto the cover.
  await page.getByTestId("overlay-p-cover").scrollIntoViewIfNeeded();
  const ruler = page.getByTestId("ruler-top");
  const rb = (await ruler.boundingBox())!;
  const target = await pointOn(page, page.getByTestId("overlay-p-cover"), 60, 40);
  await page.mouse.move(target.x, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Undo Add guide" })).toBeVisible();
  await expect(page.getByTestId("overlay-p-cover").locator('[data-testid^="guide-y-"]')).toHaveCount(1);

  // 8. Undo the lot: the autosaved doc is the original again.
  await page.keyboard.press("Escape");
  const undo = page.getByRole("button", { name: /^Undo/ });
  for (let i = 0; i < 80 && (await undo.isEnabled()); i++) await page.keyboard.press("Control+z");
  await expect(undo).toBeDisabled();
  await expect.poll(() => JSON.stringify(lastSaved(state)?.pages), { timeout: 6000 }).toBe(JSON.stringify(FIXTURE.pages));
  await expect(page.getByTestId("save-state")).toContainText("Saved");
});

test("below 1280 px the editor is view-only", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await mockApi(page);
  await page.goto("/studio/1");
  await expect(page.getByText("Editing needs a screen at least 1,280 px wide.")).toBeVisible();
  await expect(page.getByTestId("save-state")).toContainText("View only");
});

test("with the switch off, the editor isn't reachable", async ({ page }) => {
  await mockApi(page, { studio: false });
  await page.goto("/studio/1");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("studio-editor")).toHaveCount(0);
});

import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";

/**
 * PE-1 · photo edit in the editor (`/studio/:id`) on an in-memory API: select
 * the cover photo → Remove background (a job polled to done; the frame shows
 * the derived image, the original kept) → Adjust and a filter, drawn by the
 * shared renderer in the sheet → Before/after → Restore original; the
 * autosaved doc carries the edits. The "not set up" state for
 * DS_BG_UNAVAILABLE. At 1366 × 768 the photo panels open fully on screen.
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as Doc;
// A 2 × 2 PNG, so the frame has real pixels for the filters.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwHwyBNAMDA8N/ABf1A/2kQ5YkAAAAAElFTkSuQmCC";

type El = { id: string; type: string; templateLocked?: boolean; frame: { x: number; y: number; w: number; h: number }; props: Record<string, unknown> };
type Pg = { id: string; kind: string; name: string; elements?: El[] };
type Doc = { pages: Pg[]; [k: string]: unknown };

async function mockApi(page: Page, opts: { bgRemover?: boolean } = {}) {
  const doc = JSON.parse(JSON.stringify(FIXTURE)) as Doc;
  // The fixture's cover photo is template-locked; the test edits it as a free picture.
  delete doc.pages.find((p) => p.id === "p-cover")!.elements!.find((e) => e.id === "p-cover.bg")!.templateLocked;
  const state = { doc, rev: 1, patches: [] as Doc[], jobs: 0, polls: 0 };
  const asset = (id: string) => ({ id, kind: "image", w: 1200, h: 800, alt: "Plant", folder: null, url: PNG, bytes: 100, mime: "image/png", sha256: "a".repeat(64), createdAt: "2026-10-20T00:00:00.000Z" });
  const assets = [asset("a-plant")];
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
      if (path.endsWith("/studio/docs/1") && method === "GET") return json({ id: 1, doc: state.doc, rev: state.rev, status: "draft" });
      if (path.endsWith("/studio/docs/1") && method === "PATCH") {
        const b = request.postDataJSON() as { rev: number; doc: Doc };
        if (b.rev !== state.rev) return json({ code: "DS_VERSION_CONFLICT", message: "Stale", details: { rev: state.rev } }, 409);
        state.doc = b.doc;
        state.rev += 1;
        state.patches.push(b.doc);
        return json({ id: 1, doc: state.doc, rev: state.rev, status: "draft" });
      }
      if (path.endsWith("/studio/resolve")) return json({ values: [], tokens: [], dataHash: "h", unavailable: [] });
      if (path.endsWith("/remove-background") && method === "POST") {
        if (opts.bgRemover === false) return json({ code: "DS_BG_UNAVAILABLE", message: "No model" }, 503);
        state.jobs += 1;
        return json({ id: 7, kind: "remove_background", assetId: "a-plant", status: "queued", resultAssetId: null, errorCode: null, errorReason: null, createdAt: "2026-10-21T00:00:00.000Z", finishedAt: null }, 202);
      }
      if (path.endsWith("/studio/image-jobs/7")) {
        state.polls += 1;
        if (state.polls < 2) return json({ id: 7, kind: "remove_background", assetId: "a-plant", status: "running", resultAssetId: null, errorCode: null, errorReason: null, createdAt: "2026-10-21T00:00:00.000Z", finishedAt: null });
        if (!assets.some((a) => a.id === "a-plant-nobg")) assets.push({ ...asset("a-plant-nobg"), derivedFrom: { assetId: "a-plant", op: "remove_background" } } as ReturnType<typeof asset>);
        return json({ id: 7, kind: "remove_background", assetId: "a-plant", status: "done", resultAssetId: "a-plant-nobg", errorCode: null, errorReason: null, createdAt: "2026-10-21T00:00:00.000Z", finishedAt: "2026-10-21T00:00:03.000Z" });
      }
      if (path.endsWith("/studio/data")) return json({ kind: "ghg", year: 2025, yearType: "CY", siteIds: [1], groups: [] });
      if (path.endsWith("/studio/assets")) return json(assets);
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

const coverOf = (d: Doc | undefined) => d?.pages.find((p) => p.id === "p-cover")?.elements?.find((e) => e.id === "p-cover.bg");
const lastSaved = (s: { patches: Doc[] }) => s.patches[s.patches.length - 1];

async function selectCover(page: Page) {
  await page.goto("/studio/1");
  await expect(page.getByTestId("studio-editor")).toBeVisible();
  const overlay = page.getByTestId("overlay-p-cover");
  await overlay.scrollIntoViewIfNeeded();
  const box = (await overlay.boundingBox())!;
  const zoom = Number((await page.getByTestId("zoom-value").textContent())!.replace("%", "")) / 100;
  const k = (96 / 25.4) * zoom;
  // The cover photo covers the top of the page (-3,-3 216 × 160 mm); 100,40 is clear of the text.
  await page.mouse.click(box.x + 100 * k, box.y + 40 * k);
  await expect(page.getByTestId("context-toolbar")).toHaveAttribute("data-toolbar", "frame");
}

const coverImg = (page: Page) => page.locator('[data-sheet-host="p-cover"] [data-el-id="p-cover.bg"] img');

test.describe("wide screen", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("remove background → adjust and a filter in the sheet → before/after → restore original", async ({ page }) => {
    const state = await mockApi(page);
    await selectCover(page);

    await page.getByTestId("photo-remove-bg").click();
    await page.getByTestId("photo-remove-bg-run").click();
    await expect(page.getByText(/Saved as a new image/)).toBeVisible();
    await expect(coverImg(page)).toHaveAttribute("data-asset-id", "a-plant-nobg");
    await expect(page.getByTestId("photo-original-kept")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByTestId("photo-adjust").click();
    const adjust = page.getByTestId("photo-adjust-panel");
    await adjust.getByLabel("Brightness").fill("12");
    await expect(adjust.getByText("+12")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("photo-filters").click();
    await page.getByTestId("photo-filter-panel").getByRole("button", { name: /Mono/ }).click();
    // The renderer draws the edit in the editor's sheet (the same markup the PDF prints).
    await expect(coverImg(page)).toHaveAttribute("style", /filter:grayscale\(1\) contrast\(1\.1\) brightness\(1\.06\);/);

    await page.getByTestId("photo-compare").click();
    const compare = page.getByTestId("photo-compare-panel");
    await expect(compare.getByRole("img", { name: "Before" })).toBeVisible();
    await expect(compare.getByRole("img", { name: "After" })).toBeVisible();
    await page.keyboard.press("Escape");

    await expect.poll(() => coverOf(lastSaved(state))?.props, { timeout: 6000 }).toMatchObject({ assetId: "a-plant-nobg", originalAssetId: "a-plant", filter: "mono", adjust: { brightness: 12 } });

    await page.getByTestId("photo-remove-bg").click();
    await page.getByTestId("photo-restore").click();
    await expect(coverImg(page)).toHaveAttribute("data-asset-id", "a-plant");
    await expect.poll(() => coverOf(lastSaved(state))?.props.assetId, { timeout: 6000 }).toBe("a-plant");
    expect(state.jobs).toBe(1);
  });

  test("background remover not set up: says so and leaves the picture", async ({ page }) => {
    const state = await mockApi(page, { bgRemover: false });
    await selectCover(page);
    await page.getByTestId("photo-remove-bg").click();
    await page.getByTestId("photo-remove-bg-run").click();
    await expect(page.getByText("Background remover isn't set up on this server yet")).toBeVisible();
    await expect(coverImg(page)).toHaveAttribute("data-asset-id", "a-plant");
    await page.waitForTimeout(1500);
    expect(state.patches).toHaveLength(0);
  });
});

test.describe("1366 × 768", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("the photo panels open fully on screen from the toolbar", async ({ page }) => {
    await mockApi(page);
    await selectCover(page);
    const inView = async (testId: string) => {
      const box = (await page.getByTestId(testId).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1366);
      expect(box.y + box.height).toBeLessThanOrEqual(768);
    };
    // At this width the toolbar may fold its type tools into "Tools".
    const tools = page.getByTestId("context-toolbar").getByRole("button", { name: "Tools" });
    const open = async (trigger: string, panel: string) => {
      if (await tools.isVisible()) await tools.click();
      await page.getByTestId(trigger).click();
      await expect(page.getByTestId(panel)).toBeVisible();
      await inView(panel);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId(panel)).toHaveCount(0);
      // Close the folded "Tools" popover too, when the toolbar used it.
      const folded = page.getByRole("dialog", { name: "Tools" });
      if (await folded.isVisible()) await page.keyboard.press("Escape");
      await expect(folded).toHaveCount(0);
      await expect(page.getByTestId("context-toolbar")).toHaveAttribute("data-toolbar", "frame");
    };
    await open("photo-adjust", "photo-adjust-panel");
    await open("photo-filters", "photo-filter-panel");
    await open("photo-duotone", "photo-duotone-panel");
    await open("photo-remove-bg", "photo-remove-bg-panel");
  });
});

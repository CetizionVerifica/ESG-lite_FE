import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import { resizeDocument } from "../src/lib/studio/resize";

/**
 * DS-10 · Resize on an in-memory API: from the editor, make a board deck and a
 * one-page summary in one go (the mocked server runs the same engine as
 * ESG-lite, src/lib/studio/resize.ts), open the deck (its "Made from" chip and
 * slides), and present it. Then "Source data changed" once the source's data
 * moves, and the switch-off path.
 *
 * preview.html (Present) comes from the backend renderer in the app; here it is
 * a stand-in with the same bridge, one section per page of the stored design.
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
type Doc = { meta: { title: string }; format: string; purpose: string; pages: { id: string; name: string; kind: string }[]; source?: { docId: number; rev: number; dataHash: string }; [k: string]: unknown };
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as Doc;
const SIZES = {
  a4: { wMm: 210, hMm: 297 },
  a4_landscape: { wMm: 297, hMm: 210 },
  letter: { wMm: 215.9, hMm: 279.4 },
  a5: { wMm: 148, hMm: 210 },
  slide_16_9: { wMm: 338.7, hMm: 190.5 },
  square: { wMm: 285.75, hMm: 285.75 },
  social_191: { wMm: 317.5, hMm: 166.1 },
};

const presentHtml = (doc: Doc) => `<!doctype html><html><head><meta charset="utf-8"><style>section{display:none;height:100vh;color:#fff;font:40px sans-serif}section.cur{display:block}</style></head><body>
${doc.pages.map((p) => `<section data-page-id="${p.id}"><h1>${p.name}</h1></section>`).join("")}
<script>
var s=document.querySelectorAll('section'),i=0;function post(m){m.source='ds-preview';parent.postMessage(m,'*');}
function go(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(x,k){x.classList.toggle('cur',k===i)});post({type:'slide',index:i,count:s.length,pageId:s[i].getAttribute('data-page-id')});}
addEventListener('message',function(e){if(e.data&&e.data.source==='ds-host'&&e.data.type==='go')go(e.data.index)});
addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' ')go(i+1);else if(e.key==='ArrowLeft')go(i-1);else if(e.key==='Escape'||e.key==='n')post({type:'key',key:e.key});});
post({type:'ready',pageCount:s.length,error:null});go(0);
</script></body></html>`;

type ApiState = { docs: Map<number, { doc: Doc; rev: number }>; next: number; dataVersion: number; resized: Record<string, unknown>[] };

async function mockApi(page: Page, opts: { studio?: boolean } = {}) {
  const studio = opts.studio ?? true;
  const state: ApiState = { docs: new Map([[1, { doc: FIXTURE, rev: 4 }]]), next: 7, dataVersion: 1, resized: [] };
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
    },
    [JSON.stringify(user)],
  );
  await page.route(
    (url) => url.port !== APP_PORT && !url.protocol.startsWith("data") && !url.protocol.startsWith("blob"),
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

      const resize = /\/studio\/docs\/(\d+)\/resize$/.exec(path);
      if (resize && method === "POST") {
        const src = state.docs.get(Number(resize[1]))!;
        const b = request.postDataJSON() as { format: string; purpose: string; title: string; pageIds?: string[] };
        state.resized.push(b);
        const r = resizeDocument(JSON.parse(JSON.stringify(src.doc)), { ...b, sizes: SIZES, link: { docId: Number(resize[1]), rev: src.rev, dataHash: `sha256:v${state.dataVersion}` } });
        if (!r.ok) return json({ code: "DS_RESIZE_UNSUPPORTED", message: r.detail }, 422);
        const id = state.next++;
        state.docs.set(id, { doc: r.doc as unknown as Doc, rev: 1 });
        return json({ id, title: b.title, pageCount: r.doc.pages.length, dropped: r.report.dropped.length, truncated: r.report.truncated.length, summarised: 0 }, 201);
      }
      const source = /\/studio\/docs\/(\d+)\/source$/.exec(path);
      if (source) {
        const link = state.docs.get(Number(source[1]))?.doc.source;
        if (!link) return json({ source: null });
        const src = state.docs.get(link.docId)!;
        const current = `sha256:v${state.dataVersion}`;
        return json({ source: { docId: link.docId, exists: true, title: src.doc.meta.title, rev: link.rev, dataHash: link.dataHash, currentRev: src.rev, currentDataHash: current, dataChanged: current !== link.dataHash } });
      }
      const preview = /\/studio\/docs\/(\d+)\/preview\.html$/.exec(path);
      if (preview) {
        const row = state.docs.get(Number(preview[1]))!;
        return route.fulfill({ status: 200, contentType: "text/html", headers: { "x-doc-rev": String(row.rev) }, body: presentHtml(row.doc) });
      }
      const doc = /\/studio\/docs\/(\d+)$/.exec(path);
      if (doc && method === "GET") {
        const row = state.docs.get(Number(doc[1]));
        if (!row) return json({ code: "DS_DOC_NOT_FOUND", message: "Not found." }, 404);
        return json({ id: Number(doc[1]), doc: row.doc, rev: row.rev, status: "draft", title: row.doc.meta.title });
      }
      if (path.endsWith("/studio/resolve")) {
        const b = request.postDataJSON() as { bindings: unknown[]; tokens: unknown[] };
        const v = { display: "1,000.000", value: 1000, unit: "tCO₂e", source: "ghg" };
        return json({ values: b.bindings.map(() => v), tokens: b.tokens.map(() => v), dataHash: "h", unavailable: [] });
      }
      if (path.endsWith("/studio/assets") || path.endsWith("/studio/layouts") || path.endsWith("/studio/elements") || /\/studio\/docs\/\d+\/(jobs|versions|shares)$/.test(path)) return json([]);
      if (path.endsWith("/studio/brand-kit"))
        return json({ name: "ACME", logos: { primary: null, onDark: null }, colors: { primary: "#0f5132", accent: "#f59e0b", coverFrom: "#0d1526", coverTo: "#0f5132" }, defaultLook: "classic", fonts: { heading: null, body: null }, voice: "", palettes: [], canEdit: true, brandControls: false, updatedAt: null });
      if (path.includes("/studio/fonts/")) return route.fulfill({ status: 404, body: "" });
      return json({});
    },
  );
  return state;
}

test("Resize → a deck and a summary in one go; open the deck, see where it came from, and present it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await mockApi(page);
  await page.goto("/studio/1");
  await page.getByTestId("resize-open").click();
  const dialog = page.getByRole("dialog", { name: "Resize and convert" });
  await expect(dialog).toContainText("From ACME GHG inventory 2025 · A4");
  await expect(dialog.getByTestId("resize-target-deck")).toBeChecked();
  await expect(dialog.getByTestId("resize-preview").getByRole("img")).toHaveCount(3);
  await dialog.getByTestId("resize-target-summary").check();
  await dialog.getByRole("button", { name: "Create 2 copies" }).click();
  const made = dialog.getByTestId("resize-made");
  await expect(made).toContainText("2 copies made");
  expect(state.resized.map((b) => [b.format, b.purpose])).toEqual([
    ["slide_16_9", "deck"],
    ["a4", "summary"],
  ]);

  // Open the deck: a new design in 16:9, linked to the report.
  await made.getByRole("link", { name: /Open/ }).first().click();
  await expect(page).toHaveURL(/\/studio\/7$/);
  await expect(page.getByTestId("linked-source")).toContainText("Made from ACME GHG inventory 2025");
  await expect(page.getByTestId("source-data-changed")).toHaveCount(0);
  const deck = state.docs.get(7)!.doc;
  expect(deck.format).toBe("slide_16_9");
  expect(deck.source).toEqual({ docId: 1, rev: 4, dataHash: "sha256:v1" });

  // Present it: every slide with the keys, Esc back to the editor.
  await page.getByRole("link", { name: "Present" }).click();
  await expect(page).toHaveURL(/\/studio\/7\/present$/);
  const counter = page.getByTestId("present-counter");
  await expect(counter).toHaveText(`1 / ${deck.pages.length}`);
  const frame = page.frameLocator('[data-testid="preview-frame"]');
  await expect(frame.getByRole("heading", { name: deck.pages[0].name })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(counter).toHaveText(`2 / ${deck.pages.length}`);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/studio\/7$/);

  // The source's approved data moves: the copy says so.
  state.dataVersion += 1;
  await page.reload();
  await expect(page.getByTestId("source-data-changed")).toBeVisible();
  await page.getByRole("link", { name: /Made from ACME GHG inventory 2025/ }).click();
  await expect(page).toHaveURL(/\/studio\/1$/);
});

test("switch off: no editor, no Resize", async ({ page }) => {
  await mockApi(page, { studio: false });
  await page.goto("/studio/1");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("resize-open")).toHaveCount(0);
});

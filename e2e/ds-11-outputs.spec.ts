import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";

/**
 * DS-11 · outputs on an in-memory API: download the print PDF from the
 * editor's Download ▾ (a render job, polled, saved); present three pages with
 * the keys and leave with Esc; create a view link, open it signed out, revoke
 * it and reopen it → the expired page. Plus the switch-off path.
 *
 * preview.html comes from the backend renderer in the app; here it is a small
 * stand-in with the same bridge (ready / slide / key messages, `go` back), so
 * the host logic is what's tested. The renderer's output has its own goldens.
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as { pages: { id: string; name: string; notes?: string }[]; [k: string]: unknown };
const PDF = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");

/** A present-mode page with the preview bridge, three sheets. */
const PRESENT_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>section{display:none;height:100vh;color:#fff;font:40px sans-serif}section.cur{display:block}</style></head><body>
<section data-page-id="p-cover"><h1>Cover</h1></section><section data-page-id="p-summary"><h1>Summary</h1></section><section data-page-id="p-scope3"><h1>Scope 3</h1></section>
<script>
var s=document.querySelectorAll('section'),i=0;function post(m){m.source='ds-preview';parent.postMessage(m,'*');}
function go(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(x,k){x.classList.toggle('cur',k===i)});post({type:'slide',index:i,count:s.length,pageId:s[i].getAttribute('data-page-id')});}
addEventListener('message',function(e){if(e.data&&e.data.source==='ds-host'&&e.data.type==='go')go(e.data.index)});
addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' ')go(i+1);else if(e.key==='ArrowLeft')go(i-1);else if(e.key==='Escape'||e.key==='n')post({type:'key',key:e.key});});
post({type:'ready',pageCount:s.length,error:null});go(0);
</script></body></html>`;

type ApiState = { jobs: Record<string, unknown>[]; shares: { id: number; token: string; revoked: boolean; views: number }[]; polls: number; publicAuth: (string | undefined)[] };

/** One in-memory API; pages that pass the same `state` share it (the signed-out viewer sees the links). */
async function mockApi(page: Page, opts: { studio?: boolean; state?: ApiState } = {}) {
  const studio = opts.studio ?? true;
  const state: ApiState = opts.state ?? { jobs: [], shares: [], polls: 0, publicAuth: [] };
  const user = {
    user_id: 12,
    name: "Mia Haddad",
    email: "mia@acme.example",
    sites: [{ site_id: 1, name: "Bahrain plant", company: { company_id: 1, name: "ACME", design_studio_enabled: studio, kpi_tracking_enabled: false } }],
    company: { company_id: 1, name: "ACME", design_studio_enabled: studio },
  };
  await page.addInitScript(
    ([u]) => {
      if (location.pathname.startsWith("/s/")) return; // the public viewer: signed out
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
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/kpi/status")) return json({ enabled: false, setup_completed: false });
      // The public view link (no session).
      const pub = /^\/s\/([^/]+)(\/meta|\/file)?$/.exec(path);
      if (pub) {
        state.publicAuth.push(request.headers().authorization);
        const share = state.shares.find((s) => s.token === pub[1]);
        if (!share) return json({ code: "DS_DOC_NOT_FOUND", message: "Not found." }, 404);
        if (share.revoked) return json({ code: "DS_SHARE_EXPIRED", message: "This link has expired or was turned off." }, 410);
        if (pub[2] === "/file") return route.fulfill({ status: 200, contentType: "application/pdf", body: PDF });
        share.views += 1;
        return json({ title: "ACME GHG inventory 2025", company: "ACME", logoUrl: null, label: "Final v2", expiresAt: "2026-11-03T00:00:00.000Z", pageCount: 5, fileUrl: `/s/${share.token}/file` });
      }
      if (path.endsWith("/studio/status")) return json({ enabled: studio, kinds: { ghg: studio, sustainability: false } });
      if (!studio && path.includes("/studio/")) return json({ code: "DS_STUDIO_OFF", message: "Off" }, 403);
      if (path.endsWith("/studio/docs/1") && method === "GET") return json({ id: 1, doc: FIXTURE, rev: 4, status: "draft", title: "ACME GHG inventory 2025" });
      if (path.endsWith("/studio/docs/1/preview.html")) return route.fulfill({ status: 200, contentType: "text/html", headers: { "x-doc-rev": "4" }, body: PRESENT_HTML });
      if (path.endsWith("/studio/docs/1/jobs") && method === "POST") {
        const b = request.postDataJSON() as { kind: string; rev: number; options?: Record<string, unknown> };
        const job = { id: state.jobs.length + 1, docId: 1, versionId: null, versionN: null, kind: b.kind, status: "queued", errorCode: null, errorReason: null, requestedBy: 12, rev: b.rev, createdAt: "2026-10-20T10:00:00.000Z", startedAt: null, finishedAt: null, downloadUrl: null, fileName: null, bytes: null, pageCount: null, expiresAt: null, options: b.options };
        state.jobs.push(job);
        return json(job, 202);
      }
      if (path.endsWith("/studio/docs/1/jobs")) return json([...state.jobs].reverse());
      const jobFile = /\/studio\/jobs\/(\d+)\/file$/.exec(path);
      if (jobFile) return route.fulfill({ status: 200, contentType: "application/pdf", body: PDF });
      const jobGet = /\/studio\/jobs\/(\d+)$/.exec(path);
      if (jobGet) {
        const job = state.jobs[Number(jobGet[1]) - 1];
        if (state.polls++ >= 1) Object.assign(job, { status: "done", finishedAt: "2026-10-20T10:00:05.000Z", downloadUrl: `/studio/jobs/${job.id}/file`, fileName: job.kind === "print" ? "ACME-GHG-Report-2025-print.pdf" : "ACME-GHG-Report-2025-proof.pdf", pageCount: 5, expiresAt: "2026-10-27T10:00:05.000Z" });
        else job.status = "running";
        return json(job);
      }
      if (path.endsWith("/studio/docs/1/versions"))
        return json([{ id: 7, n: 2, kind: "final", rev: 4, note: null, createdAt: "2026-10-19T10:00:00.000Z", createdBy: "Mia Haddad", pageCount: 5, pdfUrl: "/studio/docs/1/versions/2/pdf", pdfSha256: null, dataHash: null, rendererHash: null, superseded: false }]);
      if (path.endsWith("/studio/docs/1/shares") && method === "POST") {
        const id = state.shares.length + 1;
        const token = `e2eToken${id}`.padEnd(43, "x");
        state.shares.push({ id, token, revoked: false, views: 0 });
        return json({ id, docId: 1, versionId: 7, versionN: 2, jobId: null, label: "Final v2", expiresAt: "2026-11-03T00:00:00.000Z", revokedAt: null, views: 0, lastViewedAt: null, createdAt: "2026-10-20T10:00:00.000Z", createdBy: "Mia Haddad", state: "active", url: `http://localhost:${APP_PORT}/s/${token}` }, 201);
      }
      if (path.endsWith("/studio/docs/1/shares"))
        return json(
          state.shares.map((s) => ({ id: s.id, docId: 1, versionId: 7, versionN: 2, jobId: null, label: "Final v2", expiresAt: "2026-11-03T00:00:00.000Z", revokedAt: s.revoked ? "2026-10-20T11:00:00.000Z" : null, views: s.views, lastViewedAt: null, createdAt: "2026-10-20T10:00:00.000Z", createdBy: "Mia Haddad", state: s.revoked ? "revoked" : "active" })),
        );
      const del = /\/studio\/shares\/(\d+)$/.exec(path);
      if (del && method === "DELETE") {
        state.shares[Number(del[1]) - 1].revoked = true;
        return route.fulfill({ status: 204, body: "" });
      }
      if (path.endsWith("/studio/resolve")) {
        const b = request.postDataJSON() as { bindings: unknown[]; tokens: unknown[] };
        const v = { display: "1,000", value: 1000, unit: "tCO₂e", source: "ghg" };
        return json({ values: b.bindings.map(() => v), tokens: b.tokens.map(() => v), dataHash: "h", unavailable: [] });
      }
      if (path.endsWith("/studio/assets") || path.endsWith("/studio/layouts") || path.endsWith("/studio/elements")) return json([]);
      if (path.endsWith("/studio/brand-kit"))
        return json({ name: "ACME", logos: { primary: null, onDark: null }, colors: { primary: "#0f5132", accent: "#f59e0b", coverFrom: "#0d1526", coverTo: "#0f5132" }, defaultLook: "classic", fonts: { heading: null, body: null }, voice: "", palettes: [], canEdit: true, brandControls: false, updatedAt: null });
      if (path.includes("/studio/fonts/")) return route.fulfill({ status: 404, body: "" });
      return json({});
    },
  );
  return state;
}

test("Download ▾ → PDF for print: a render job, polled, and the file saved", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await mockApi(page);
  await page.goto("/studio/1");
  await page.getByTestId("download-menu").click();
  await page.getByTestId("dl-print").click();
  await expect(page.getByRole("switch", { name: "Crop marks" })).toHaveAttribute("aria-checked", "true");
  const download = page.waitForEvent("download");
  await page.getByTestId("dl-print-go").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("ACME-GHG-Report-2025-print.pdf");
  expect(state.jobs[0]).toMatchObject({ kind: "print", rev: 4, options: { cropMarks: true } });
  await expect(page.getByTestId("download-status")).toContainText("PDF for print is ready.");
});

test("Present: three pages with the keys, the page counter, and Esc back to the editor", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await page.goto("/studio/1/present");
  const counter = page.getByTestId("present-counter");
  await expect(counter).toHaveText("1 / 3");
  const deck = page.frameLocator('[data-testid="preview-frame"]');
  await expect(deck.getByRole("heading", { name: "Cover" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(counter).toHaveText("2 / 3");
  await expect(deck.getByRole("heading", { name: "Summary" })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(counter).toHaveText("3 / 3");
  await expect(deck.getByRole("heading", { name: "Scope 3" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(counter).toHaveText("3 / 3");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/studio\/1$/);
});

test("View link: create, open signed out, revoke, reopen → expired", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await mockApi(page);
  await page.goto("/studio/1");
  await page.getByTestId("share-menu").click();
  await page.getByTestId("share-view-link").click();
  const dialog = page.getByRole("dialog", { name: "View link" });
  await expect(dialog.getByLabel("What to share")).toContainText("Final v2");
  await dialog.getByRole("button", { name: "Create link" }).click();
  const link = await dialog.getByLabel("Link to share").inputValue();
  expect(link).toMatch(/\/s\/e2eToken1x+$/);

  // Signed out, in another browser context.
  const outside = await browser.newContext();
  const viewer = await outside.newPage();
  await mockApi(viewer, { state });
  await viewer.goto(new URL(link).pathname);
  await expect(viewer.getByTestId("public-viewer")).toContainText("Final v2");
  await expect(viewer.getByTestId("public-viewer")).toContainText("Read only");
  // The viewer's calls carry no session.
  expect(state.publicAuth.length).toBeGreaterThan(0);
  expect(state.publicAuth.filter(Boolean)).toEqual([]);

  // Revoke it, then the link is gone.
  await dialog.getByRole("button", { name: /^Revoke / }).click();
  await dialog.getByRole("button", { name: "Turn off" }).click();
  await expect(dialog.getByTestId("view-link-list")).toContainText("Turned off");
  await viewer.reload();
  await expect(viewer.getByText("This link has expired.")).toBeVisible();
  expect(state.shares[0]).toMatchObject({ revoked: true, views: 1 });
  await outside.close();
});

test("switch off: Page view and Present aren't reachable", async ({ page }) => {
  await mockApi(page, { studio: false });
  await page.goto("/studio/1/present");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("studio-present")).toHaveCount(0);
});

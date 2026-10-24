import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";

/**
 * DS-12 · checks and the final on an in-memory API: the top bar's counter, the
 * panel, Go to the page, the one-click fix (Move inside margin), the counter
 * going down after the autosave, then the final enabled, its warning ticked
 * and sent as acknowledgedWarnings. Plus the switch-off path.
 *
 * The in-memory checks follow the doc the editor saves: the fixture's page
 * number sits in the bottom margin (OUTSIDE_SAFE_AREA, an error) until it is
 * moved; market-based Scope 2 stays a warning (D7). The real rules have their
 * own unit and API tests in ESG-lite.
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
type Doc = { pages: { id: string; kind: string; name: string; elements?: { id: string; frame: { y: number; h: number } }[] }[]; [k: string]: unknown };
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as Doc;

type ApiState = { doc: Doc; rev: number; jobs: Record<string, unknown>[]; checks: number; patches: number };

const SAFE_BOTTOM = 297 - 10;
function checksFor(doc: Doc) {
  const pn = doc.pages.flatMap((p) => p.elements ?? []).find((e) => e.id === "p-summary.pn");
  const out: Record<string, unknown>[] = [];
  if (pn && pn.frame.y + pn.frame.h > SAFE_BOTTOM + 0.05) {
    out.push({ id: "OUTSIDE_SAFE_AREA", severity: "error", pageId: "p-summary", elementId: "p-summary.pn", message: "This element is outside the 10 mm page margin and may be trimmed when printed.", fix: "move_inside" });
  }
  out.push({ id: "SCOPE2_MARKET_MISSING", severity: "warning", pageId: "p-summary", elementId: "p-summary.market", message: "Market-based Scope 2 isn't recorded, so it shows as Not reported.", fix: "open_inputs", details: { inputKey: "scope2_instruments" } });
  out.push({ id: "UNLINKED_DATA", severity: "info", pageId: "p-scope3", elementId: "p-scope3.custom", message: "Typed data, not linked to approved data. Check the figures before the final." });
  return out;
}

async function mockApi(page: Page, opts: { studio?: boolean } = {}) {
  const studio = opts.studio ?? true;
  const state: ApiState = { doc: JSON.parse(JSON.stringify(FIXTURE)) as Doc, rev: 4, jobs: [], checks: 0, patches: 0 };
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
      if (path.endsWith("/studio/docs/1") && method === "GET") return json({ id: 1, doc: state.doc, rev: state.rev, status: "draft", title: "ACME GHG inventory 2025" });
      if (path.endsWith("/studio/docs/1") && method === "PATCH") {
        const b = request.postDataJSON() as { rev: number; doc?: Doc };
        if (b.rev !== state.rev) return json({ code: "DS_VERSION_CONFLICT", message: "Changed", details: { rev: state.rev } }, 409);
        if (b.doc) state.doc = b.doc;
        state.rev += 1;
        state.patches += 1;
        return json({ id: 1, doc: state.doc, rev: state.rev, status: "draft", title: "ACME GHG inventory 2025" });
      }
      if (path.endsWith("/studio/docs/1/checks")) {
        const b = request.postDataJSON() as { rev: number };
        if (b.rev !== state.rev) return json({ code: "DS_VERSION_CONFLICT", message: "Changed", details: { rev: state.rev } }, 409);
        state.checks += 1;
        const checks = checksFor(state.doc);
        return json({ checks, blocking: checks.some((c) => c.severity === "error"), warnings: [...new Set(checks.filter((c) => c.severity === "warning").map((c) => c.id))], layout: "none", rev: state.rev });
      }
      if (path.endsWith("/studio/docs/1/versions"))
        return json([{ id: 7, n: 2, kind: "final", rev: 3, note: null, createdAt: "2026-10-19T10:00:00.000Z", createdBy: "Mia Haddad", pageCount: 5, pdfUrl: "/studio/docs/1/versions/2/pdf", pdfSha256: null, dataHash: null, rendererHash: null, superseded: false }]);
      if (path.endsWith("/studio/docs/1/jobs") && method === "POST") {
        const b = request.postDataJSON() as { kind: string; rev: number; acknowledgedWarnings?: string[]; note?: string };
        const errors = checksFor(state.doc).filter((c) => c.severity === "error");
        if (b.kind === "final" && errors.length) return json({ code: "DS_CHECKS_BLOCKING", message: "Fix the errors", details: { reason: "errors", checks: errors } }, 409);
        const job = { id: state.jobs.length + 1, docId: 1, versionId: null, versionN: null, kind: b.kind, status: "queued", errorCode: null, errorReason: null, requestedBy: 12, rev: b.rev, createdAt: "2026-10-20T10:00:00.000Z", startedAt: null, finishedAt: null, downloadUrl: null, fileName: null, bytes: null, pageCount: null, expiresAt: null, acknowledgedWarnings: b.acknowledgedWarnings, note: b.note };
        state.jobs.push(job);
        return json(job, 202);
      }
      if (path.endsWith("/studio/docs/1/jobs")) return json([...state.jobs].reverse());
      const jobGet = /\/studio\/jobs\/(\d+)$/.exec(path);
      if (jobGet) {
        const job = state.jobs[Number(jobGet[1]) - 1];
        Object.assign(job, { status: "done", versionId: 8, versionN: 3, finishedAt: "2026-10-20T10:00:05.000Z", downloadUrl: `/studio/jobs/${job.id}/file`, fileName: "ACME-GHG-Report-2025-v3.pdf", pageCount: 5 });
        return json(job);
      }
      if (/\/studio\/jobs\/\d+\/file$/.test(path)) return route.fulfill({ status: 200, contentType: "application/pdf", body: Buffer.from("%PDF-1.7\n%%EOF\n") });
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

test("checks: the counter, Go to the page, the fix, then the final with its warning acknowledged", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await mockApi(page);
  await page.goto("/studio/1");
  const counter = page.getByTestId("checks-counter");
  await expect(counter).toHaveText(/2 checks/);
  await counter.click();
  const panel = page.getByTestId("checks-panel");
  await expect(panel.getByTestId("checks-counts")).toContainText("1 must fix · 1 to review · 1 for info");
  await expect(panel.getByTestId("checks-final")).toBeDisabled();
  await expect(panel.getByTestId("checks-final-reason")).toHaveText("Fix 1 check to generate the final.");

  // Go to the page of the error: the page number is selected.
  const row = panel.locator('[data-check-id="OUTSIDE_SAFE_AREA"]');
  await row.getByTestId("check-goto").click();
  await expect(page.getByTestId("context-toolbar")).toHaveAttribute("data-toolbar", "page_number");

  // The one-click fix, saved, and the checks run again.
  await row.getByTestId("fix-move_inside").click();
  await expect(counter).toHaveText(/1 check\b/, { timeout: 10_000 });
  expect(state.patches).toBeGreaterThan(0);
  const pn = state.doc.pages.flatMap((p) => p.elements ?? []).find((e) => e.id === "p-summary.pn")!;
  expect(pn.frame.y + pn.frame.h).toBeLessThanOrEqual(SAFE_BOTTOM + 0.05);
  await expect(panel.getByTestId("checks-final")).toBeEnabled();

  // The final: tick the warning, write the note (a final exists), generate.
  await panel.getByTestId("checks-final").click();
  const dialog = page.getByRole("dialog", { name: "Generate the final PDF" });
  await expect(dialog.getByTestId("final-version")).toHaveText("This will be Final v3.");
  const go = dialog.getByTestId("final-go");
  await expect(go).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByLabel(/What changed since the last final/).fill("Moved the page number inside the margin");
  await expect(go).toBeEnabled();
  await go.click();
  await expect.poll(() => state.jobs.length).toBe(1);
  expect(state.jobs[0]).toMatchObject({ kind: "final", acknowledgedWarnings: ["SCOPE2_MARKET_MISSING"], note: "Moved the page number inside the margin" });
});

test("switch off: no checks in the studio", async ({ page }) => {
  await mockApi(page, { studio: false });
  await page.goto("/studio/1");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("checks-counter")).toHaveCount(0);
});

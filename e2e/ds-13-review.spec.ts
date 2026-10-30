import { readFileSync } from "node:fs";
import { type Browser, type Page, expect, test } from "@playwright/test";

/**
 * DS-13 · review on an in-memory API (spec "Playwright: mention a colleague,
 * assign a task, request approval, approve, generate the final"): Mia (a
 * Manager) comments with an @mention and assigns the task to Omar, then asks
 * Asha to approve; Asha (another Manager, in her own browser) approves; with
 * "Require approval before a final" on, Mia's final is blocked until then and
 * goes through after. Plus the switch-off path.
 *
 * The rules themselves (who may be mentioned, the rev tie, the gate) have
 * their API tests in ESG-lite (ci/api/tests/ds-13-collab.test.cjs).
 */

const APP_PORT = process.env.E2E_PORT ?? "4173";
type Doc = { pages: { id: string; kind: string; name: string; elements?: { id: string }[] }[]; [k: string]: unknown };
const FIXTURE = JSON.parse(readFileSync(new URL("../src/test/fixtures/studio/ghg-doc.json", import.meta.url), "utf8")) as Doc;

const PEOPLE = [
  { id: 14, name: "Asha Rao", role: "Manager", canApprove: true },
  { id: 12, name: "Mia Haddad", role: "Manager", canApprove: true },
  { id: 13, name: "Omar Saleh", role: "Admin", canApprove: false },
];
const nameOf = (id: number) => PEOPLE.find((p) => p.id === id)?.name ?? "Someone";

type Comment = Record<string, unknown> & { id: number; parentId: number | null; resolvedAt: string | null };
type Approval = Record<string, unknown> & { id: number; state: string; rev: number; reviewerId: number };
type ApiState = { doc: Doc; rev: number; jobs: Record<string, unknown>[]; comments: Comment[]; approvals: Approval[]; requireReview: boolean };

const newState = (): ApiState => ({ doc: JSON.parse(JSON.stringify(FIXTURE)) as Doc, rev: 4, jobs: [], comments: [], approvals: [], requireReview: true });

async function mockApi(page: Page, state: ApiState, opts: { studio?: boolean; userId?: number } = {}) {
  const studio = opts.studio ?? true;
  const me = opts.userId ?? 12;
  const user = {
    user_id: me,
    name: nameOf(me),
    email: "person@acme.example",
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
  const now = "2026-10-20T10:00:00.000Z";
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
      if (path.endsWith("/studio/status")) return json({ enabled: studio, kinds: { ghg: studio, sustainability: false } });
      if (!studio && path.includes("/studio/")) return json({ code: "DS_STUDIO_OFF", message: "Off" }, 403);
      if (path.endsWith("/studio/docs/1") && method === "GET") return json({ id: 1, doc: state.doc, rev: state.rev, status: "draft", title: "ACME GHG inventory 2025" });
      if (path.endsWith("/studio/docs/1") && method === "PATCH") {
        const b = request.postDataJSON() as { rev: number; doc?: Doc };
        if (b.rev !== state.rev) return json({ code: "DS_VERSION_CONFLICT", message: "Changed", details: { rev: state.rev } }, 409);
        if (b.doc) state.doc = b.doc;
        state.rev += 1;
        return json({ id: 1, doc: state.doc, rev: state.rev, status: "draft", title: "ACME GHG inventory 2025" });
      }
      // DS-13
      if (path.endsWith("/studio/docs/1/people")) return json(PEOPLE);
      if (path.endsWith("/studio/docs/1/drift")) return json({ dataHash: "h", changed: [] });
      if (path.endsWith("/studio/review-settings")) return json({ requireReview: state.requireReview, brandControls: false, canEditRequireReview: true, canEditBrandControls: false });
      if (path.endsWith("/studio/docs/1/comments") && method === "POST") {
        const b = request.postDataJSON() as { pageId: string; elementId?: string | null; body: string; mentions?: number[]; taskAssigneeId?: number | null; parentId?: number | null };
        const mentions = (b.mentions ?? []).filter((m) => m !== me && PEOPLE.some((p) => p.id === m));
        const c: Comment = { id: state.comments.length + 1, docId: 1, pageId: b.pageId, elementId: b.elementId ?? null, x: null, y: null, parentId: b.parentId ?? null, body: b.body, authorId: me, authorName: nameOf(me), mentions, mentionNames: mentions.map(nameOf), taskAssigneeId: b.taskAssigneeId ?? null, taskAssigneeName: b.taskAssigneeId ? nameOf(b.taskAssigneeId) : null, taskDoneAt: null, resolvedAt: null, resolvedByName: null, createdAt: now, updatedAt: now };
        state.comments.push(c);
        return json(c, 201);
      }
      if (path.endsWith("/studio/docs/1/comments")) {
        const mine = url.searchParams.get("tasks") === "mine";
        return json(state.comments.filter((c) => !c.resolvedAt && (!mine || (c.taskAssigneeId === me && !c.taskDoneAt))));
      }
      if (path.endsWith("/studio/docs/1/approvals") && method === "POST") {
        const b = request.postDataJSON() as { reviewerId: number; rev: number; note?: string | null; dueAt?: string | null };
        if (b.rev !== state.rev) return json({ code: "DS_VERSION_CONFLICT", message: "Changed", details: { rev: state.rev } }, 409);
        for (const a of state.approvals) if (a.state === "requested") a.state = "none";
        const a: Approval = { id: state.approvals.length + 1, docId: 1, rev: state.rev, requestedBy: me, requestedByName: nameOf(me), reviewerId: b.reviewerId, reviewerName: nameOf(b.reviewerId), dueAt: b.dueAt ?? null, state: "requested", note: b.note ?? null, decisionNote: null, decidedAt: null, createdAt: now };
        state.approvals.push(a);
        return json(a, 201);
      }
      if (path.endsWith("/studio/docs/1/approvals")) {
        const list = [...state.approvals].reverse();
        const current = list.find((a) => a.state !== "none") ?? null;
        return json({ approvals: list, current, stale: current?.state === "approved" && current.rev !== state.rev, rev: state.rev, requireReview: state.requireReview });
      }
      const decide = /\/studio\/approvals\/(\d+)\/decide$/.exec(path);
      if (decide) {
        const a = state.approvals[Number(decide[1]) - 1];
        const b = request.postDataJSON() as { decision: string; note?: string };
        if (a.reviewerId !== me) return json({ code: "DS_ROLE", message: "Only the reviewer can decide" }, 403);
        Object.assign(a, { state: b.decision === "approve" ? "approved" : "changes_requested", decisionNote: b.note ?? null, decidedAt: now, rev: b.decision === "approve" ? state.rev : a.rev });
        return json(a);
      }
      // DS-12 checks (one warning) and DS-11 jobs, with the DS-13 approval gate.
      if (path.endsWith("/studio/docs/1/checks")) {
        const checks = [{ id: "SCOPE2_MARKET_MISSING", severity: "warning", pageId: "p-summary", elementId: "p-summary.market", message: "Market-based Scope 2 isn't recorded, so it shows as Not reported." }];
        return json({ checks, blocking: false, warnings: ["SCOPE2_MARKET_MISSING"], layout: "none", rev: state.rev });
      }
      if (path.endsWith("/studio/docs/1/versions")) return json([]);
      if (path.endsWith("/studio/docs/1/jobs") && method === "POST") {
        const b = request.postDataJSON() as { kind: string; rev: number; acknowledgedWarnings?: string[] };
        if (b.kind === "final" && state.requireReview) {
          const cur = [...state.approvals].reverse().find((a) => a.state !== "none");
          if (!cur || cur.state !== "approved" || cur.rev !== b.rev) return json({ code: "DS_APPROVAL_PENDING", message: "This design is waiting for approval.", details: { reason: cur ? cur.state : "none" } }, 409);
        }
        const job = { id: state.jobs.length + 1, docId: 1, versionId: null, versionN: null, kind: b.kind, status: "queued", errorCode: null, errorReason: null, requestedBy: me, rev: b.rev, createdAt: now, startedAt: null, finishedAt: null, downloadUrl: null, fileName: null, bytes: null, pageCount: null, expiresAt: null, acknowledgedWarnings: b.acknowledgedWarnings };
        state.jobs.push(job);
        return json(job, 202);
      }
      if (path.endsWith("/studio/docs/1/jobs")) return json([...state.jobs].reverse());
      const jobGet = /\/studio\/jobs\/(\d+)$/.exec(path);
      if (jobGet) {
        const job = state.jobs[Number(jobGet[1]) - 1];
        Object.assign(job, { status: "done", versionId: 8, versionN: 1, finishedAt: now, downloadUrl: `/studio/jobs/${job.id}/file`, fileName: "ACME-GHG-Report-2025-v1.pdf", pageCount: 5 });
        return json(job);
      }
      if (/\/studio\/jobs\/\d+\/file$/.test(path)) return route.fulfill({ status: 200, contentType: "application/pdf", body: Buffer.from("%PDF-1.7\n%%EOF\n") });
      if (path.endsWith("/studio/docs/1/shares")) return json([]);
      if (path.endsWith("/studio/resolve")) {
        const b = request.postDataJSON() as { bindings: unknown[]; tokens: unknown[] };
        const v = { display: "1,000.000", value: 1000, unit: "tCO₂e", source: "ghg" };
        return json({ values: b.bindings.map(() => v), tokens: b.tokens.map(() => v), dataHash: "h", unavailable: [] });
      }
      if (path.endsWith("/studio/assets") || path.endsWith("/studio/layouts") || path.endsWith("/studio/elements")) return json([]);
      if (path.endsWith("/studio/brand-kit"))
        return json({ name: "ACME", logos: { primary: null, onDark: null }, colors: { primary: "#0f5132", accent: "#f59e0b", coverFrom: "#0d1526", coverTo: "#0f5132" }, defaultLook: "classic", fonts: { heading: null, body: null }, voice: "", palettes: [], canEdit: true, brandControls: false, updatedAt: null });
      if (path.includes("/studio/fonts/")) return route.fulfill({ status: 404, body: "" });
      return json({});
    },
  );
}

async function asReviewer(browser: Browser, state: ApiState) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await mockApi(page, state, { userId: 14 });
  await page.goto("/studio/1");
  const bar = page.getByTestId("approval-bar");
  await expect(bar).toContainText("Approval requested from Asha Rao");
  await bar.getByRole("button", { name: "Approve" }).click();
  await expect(bar).toContainText("Approved by Asha Rao");
  await ctx.close();
}

test("review: mention a colleague, assign a task, request approval, approve, generate the final", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = newState();
  await mockApi(page, state);
  await page.goto("/studio/1");

  // Comment with an @mention and a task.
  await page.getByTestId("comments-button").click();
  const panel = page.getByTestId("review-panel");
  const box = panel.getByRole("combobox", { name: "New comment" });
  await box.fill("Please check the Scope 1 sentence ");
  await box.pressSequentially("@As");
  await page.getByRole("listbox", { name: "People" }).getByRole("option", { name: /Asha Rao/ }).click();
  await panel.getByLabel("Assign as task").selectOption({ label: "Omar Saleh" });
  await panel.getByRole("button", { name: "Comment" }).click();
  const thread = panel.getByRole("article", { name: "Comment by Mia Haddad" });
  await expect(thread.getByText("@Asha Rao")).toBeVisible();
  await expect(thread.getByText(/Task · Omar Saleh/)).toBeVisible();
  expect(state.comments[0]).toMatchObject({ mentions: [14], taskAssigneeId: 13 });
  await expect(page.getByTestId("comments-button")).toContainText("Comments 1");

  // Request approval from Asha.
  await page.getByTestId("share-menu").click();
  await page.getByTestId("share-request-approval").click();
  const dialog = page.getByRole("dialog", { name: "Request approval" });
  await dialog.getByLabel(/Reviewer/).selectOption({ label: "Asha Rao" });
  await dialog.getByLabel(/Note/).fill("For the board pack");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByTestId("approval-bar")).toContainText("Approval requested from Asha Rao");

  // The final waits for the approval.
  await page.getByTestId("checks-counter").click();
  await page.getByTestId("checks-final").click();
  const final = page.getByRole("dialog", { name: "Generate the final PDF" });
  await expect(final.getByTestId("final-blocked")).toHaveText("Waiting for approval from Asha Rao.");
  await final.getByRole("button", { name: "Close" }).first().click();

  // Asha approves in her own browser.
  await asReviewer(browser, state);

  // Back to Mia: approved; the final goes through.
  await page.reload();
  await expect(page.getByTestId("approval-bar")).toContainText("Approved by Asha Rao");
  await page.getByTestId("checks-counter").click();
  await page.getByTestId("checks-final").click();
  const final2 = page.getByRole("dialog", { name: "Generate the final PDF" });
  await final2.getByRole("checkbox").check();
  await final2.getByTestId("final-go").click();
  await expect.poll(() => state.jobs.length).toBe(1);
  expect(state.jobs[0]).toMatchObject({ kind: "final", acknowledgedWarnings: ["SCOPE2_MARKET_MISSING"] });
});

test("switch off: no comments or approvals in the studio", async ({ page }) => {
  await mockApi(page, newState(), { studio: false });
  await page.goto("/studio/1");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("comments-button")).toHaveCount(0);
  await expect(page.getByTestId("approval-bar")).toHaveCount(0);
});

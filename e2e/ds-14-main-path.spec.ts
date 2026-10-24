import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";

/**
 * DS-14F · the Design Studio main path on the REAL backend (every other ds-* spec mocks the API).
 * Run it with playwright.ds-real.config.ts against ESG-lite's ci/golden/ds/e2e-stack.cjs (a
 * throwaway database with the DS seed companies); without DS_E2E_STACK it is skipped.
 *
 * As DS Seed Cement's Manager (FY 2026, approved data only):
 *   GHG report → Design this report → Inventory (Classic) → build → the editor shows the GHG
 *   page's total → Resize to a deck (linked) → back on the report: checks, the final with its
 *   warnings ticked (rendered by the server's Chromium) → a view link opened signed out, then
 *   turned off. Then the Superadmin switches the studio off: no nav item, no button, no pages.
 */

type Stack = { api: string; companyId: number; tokens: { manager: string; superadmin: string }; templates: Record<string, number> };
const stackFile = process.env.DS_E2E_STACK;
const stack: Stack | null = stackFile ? (JSON.parse(readFileSync(stackFile, "utf8")) as Stack) : null;

test.skip(!stack, "needs the real stack: ESG-lite ci/golden/ds/e2e-stack.cjs and DS_E2E_STACK (see playwright.ds-real.config.ts)");

async function api<T = unknown>(method: string, route: string, body?: unknown, token = stack!.tokens.manager): Promise<{ status: number; json: T }> {
  const res = await fetch(`${stack!.api}${route}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = (res.headers.get("content-type") ?? "").includes("json") ? ((await res.json()) as T) : (null as T);
  return { status: res.status, json };
}

async function signIn(page: Page) {
  const me = await api<{ user: unknown; role: string }>("GET", "/auth/me");
  expect(me.status).toBe(200);
  await page.addInitScript(
    ([token, role, user]) => {
      localStorage.setItem("token", token);
      localStorage.setItem("role", role);
      localStorage.setItem("user", user);
    },
    [stack!.tokens.manager, me.json.role, JSON.stringify(me.json.user)],
  );
}

const reportsMenu = async (page: Page) => {
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Reports" }).click();
  return page.getByRole("menu");
};

const setStudio = (on: boolean) => api("PUT", `/admin/companies/${stack!.companyId}`, { design_studio_enabled: on }, stack!.tokens.superadmin);

/** What a person does before a final that the data can't do: report details, and the template's empty placeholders removed. */
async function readyForFinal(docId: number) {
  type Check = { id: string; severity: string; elementId?: string; details?: { category?: number } };
  type Exclusion = { what: string; reason: string };
  type Inputs = { rev: number; inputs: { exclusions?: { value: Exclusion[] } }; prefill: { exclusions?: { value: Exclusion[] } } };
  const cur = await api<Inputs>("GET", `/studio/docs/${docId}/inputs`);
  const was = cur.json.inputs.exclusions?.value ?? cur.json.prefill.exclusions?.value ?? [];
  const first = await api<{ checks: Check[] }>("POST", `/studio/docs/${docId}/checks`, { rev: cur.json.rev });
  const unaddressed = first.json.checks.filter((c) => c.id === "SCOPE3_CATEGORY_UNADDRESSED").map((c) => c.details?.category);
  const inputs = await api<{ rev: number }>("PATCH", `/studio/docs/${docId}/inputs`, {
    rev: cur.json.rev,
    inputs: {
      consolidation_approach: { value: "Operational control" },
      responsible_person: { value: "Head of Sustainability" },
      uncertainty_statement: { value: "Activity data is metered or invoiced; factor uncertainty follows the published sources." },
      verification: { value: { status: "none" } },
      exclusions: { value: [...was, ...unaddressed.map((n) => ({ what: `Category ${n}`, reason: "Not relevant for a cement producer in the Scope 3 screening." }))] },
    },
  });
  expect(inputs.status).toBe(200);
  const empty = new Set(first.json.checks.filter((c) => c.id === "EMPTY_PLACEHOLDER").map((c) => c.elementId));
  const doc = await api<{ rev: number; doc: { pages: { kind: string; elements?: { id: string }[] }[] } }>("GET", `/studio/docs/${docId}`);
  for (const p of doc.json.doc.pages) if (p.elements) p.elements = p.elements.filter((e) => !empty.has(e.id));
  expect((await api("PATCH", `/studio/docs/${docId}`, { rev: doc.json.rev, doc: doc.json.doc })).status).toBe(200);
}

test.describe.configure({ mode: "serial" });

test("main path on the real stack: GHG report → design → build → resize → checks → final → view link", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  expect((await setStudio(true)).status).toBe(200);
  await signIn(page);
  const tables = await api<{ totals: Record<string, { total: number }> }>("POST", "/user/ghg/tables", { siteIds: [11, 12], yearType: "FY", year: 2026 });
  const total = Math.round(tables.json.totals["2026"].total).toLocaleString("en-US");

  // GHG report → Design this report, with the page's year and sites.
  await page.goto("/reports/ghg?cal=FY&freq=year&year=2026");
  await expect(page.getByRole("heading", { level: 1, name: "GHG report" })).toBeVisible();
  await expect((await reportsMenu(page)).getByRole("menuitem", { name: "Design Studio" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Design this report" }).click();
  await expect(page).toHaveURL(/\/studio\/new\?kind=ghg&.*year=2026&yearType=FY/);
  await page.getByTestId(`template-${stack!.templates["ghg-inventory-classic"]}`).click();
  await page.getByTestId("new-next").click();
  await expect(page.getByLabel("Year", { exact: true })).toHaveValue("2026");
  await page.getByTestId("new-next").click();
  await page.getByTestId("new-next").click();
  await page.getByTestId("new-build").click();

  // The editor: every page of the Inventory, the GHG report's total on the summary page.
  await expect(page).toHaveURL(/\/studio\/\d+$/, { timeout: 60_000 });
  const docId = Number(new URL(page.url()).pathname.split("/").pop());
  await expect(page.getByTestId("studio-editor")).toBeVisible();
  await expect(page.locator("[data-page-slot]")).toHaveCount(23);
  await page.locator('[data-page-slot="p04-exec_summary"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-sheet-host="p04-exec_summary"]')).toContainText(total);

  // Resize to a board deck: a linked copy in 16:9.
  await page.getByTestId("resize-open").click();
  const dialog = page.getByRole("dialog", { name: "Resize and convert" });
  await expect(dialog.getByTestId("resize-target-deck")).toBeChecked();
  await dialog.getByRole("button", { name: /^Create/ }).click();
  // One copy opens at once.
  await expect(page).not.toHaveURL(new RegExp(`/studio/${docId}$`), { timeout: 60_000 });
  await expect(page.getByTestId("linked-source")).toContainText("Made from");
  const deckId = Number(new URL(page.url()).pathname.split("/").pop());
  const deck = await api<{ doc: { format: string; source: { docId: number } } }>("GET", `/studio/docs/${deckId}`);
  expect(deck.json.doc.format).toBe("slide_16_9");
  expect(deck.json.doc.source.docId).toBe(docId);

  // Back on the report: the checks list what blocks the final.
  await page.goto(`/studio/${docId}`);
  await page.getByTestId("checks-counter").click();
  await expect(page.getByTestId("checks-panel").getByTestId("checks-final")).toBeDisabled();
  // The person fills the report details and deletes the empty placeholders (done through the API
  // here while the report isn't open, so no autosave races it), then opens the report again.
  await page.goto(`/studio/${deckId}`);
  await readyForFinal(docId);
  await page.goto(`/studio/${docId}`);
  await page.getByTestId("checks-counter").click();
  const panel = page.getByTestId("checks-panel");
  await expect(panel.getByTestId("checks-final")).toBeEnabled({ timeout: 30_000 });
  await panel.getByTestId("checks-final").click();
  const finalDialog = page.getByRole("dialog", { name: "Generate the final PDF" });
  await expect(finalDialog.getByTestId("final-version")).toBeVisible();
  // Tick every warning (the dialog runs the checks again, so the list can re-render meanwhile).
  const unticked = finalDialog.locator('input[type="checkbox"]:not(:checked)');
  await expect(async () => {
    while ((await unticked.count()) > 0) await unticked.first().check({ timeout: 2_000 });
    await expect(finalDialog.getByTestId("final-go")).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await finalDialog.getByTestId("final-go").click();
  // The server renders the final (Chromium): a final version with its stored PDF.
  await expect.poll(async () => (await api<{ n: number }[]>("GET", `/studio/docs/${docId}/versions?kind=final`)).json.length, { timeout: 180_000, intervals: [2_000] }).toBe(1);

  // Later: a view link to the final, opened signed out, then turned off.
  await page.reload();
  await expect(page.getByTestId("studio-editor")).toBeVisible();
  await page.getByTestId("share-menu").click();
  await page.getByTestId("share-view-link").click();
  const share = page.getByRole("dialog", { name: "View link" });
  await expect(share.getByLabel("What to share")).toContainText("Final v");
  await share.getByRole("button", { name: "Create link" }).click();
  const link = await share.getByLabel("Link to share").inputValue();
  expect(link).toMatch(/\/s\/[A-Za-z0-9_-]{43}$/);
  const outside = await browser.newContext();
  const viewer = await outside.newPage();
  await viewer.goto(new URL(link).pathname);
  await expect(viewer.getByTestId("public-viewer")).toContainText("Final v");
  await share.getByRole("button", { name: /^Revoke / }).click();
  await share.getByRole("button", { name: "Turn off" }).click();
  await expect(share.getByTestId("view-link-list")).toContainText("Turned off");
  await viewer.reload();
  await expect(viewer.getByText("This link has expired.")).toBeVisible();
  await outside.close();
});

test("switch off on the real stack: no nav item, no Design this report, no studio pages; the API answers DS_STUDIO_OFF", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  expect((await setStudio(false)).status).toBe(200);
  try {
    await signIn(page);
    await page.goto("/reports/ghg?cal=FY&freq=year&year=2026");
    await expect(page.getByRole("heading", { level: 1, name: "GHG report" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Design this report" })).toHaveCount(0);
    await expect((await reportsMenu(page)).getByRole("menuitem", { name: "Design Studio" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto("/studio");
    await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
    const off = await api<{ code: string }>("GET", "/studio/docs");
    expect([off.status, off.json.code]).toEqual([403, "DS_STUDIO_OFF"]);
  } finally {
    await setStudio(true);
  }
});

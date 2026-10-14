import { type Page, expect, test } from "@playwright/test";
import { MOCK_PROFILE, MOCK_PROPOSAL } from "../src/features/bulk-upload/smart/fixtures";

/**
 * XI4 Smart import smoke test. The AI service (`/v1/excel/*`) and ESG-lite
 * (`/imports/*`) answer from fixtures and the calls are recorded, so the test
 * checks what the flow sends: the confirmed proposal, the row skips and the
 * commit at the plan's current version.
 */

const COMPANY_ON = { company_id: 1, name: "Midal Cables", ai_import_enabled: true };
const HIDD = {
  site_id: 1,
  name: "Hidd",
  company: COMPANY_ON,
  categories: [
    { category_id: 1, category_name: "Fuel", scope: "Scope 1" },
    { category_id: 3, category_name: "Electricity", scope: "Scope 2" },
  ],
};
const MANAGER = { user_id: 5, name: "Maya Manager", email: "maya@example.com", sites: [HIDD] };
const HEADERS = ["Plant", "Month", "Activity", "Litres used", "UoM", "Inv #"];

const PLAN_ID = "11111111-2222-4333-8444-555555555555";
const ROWS = [
  { row: 1, row_ref: "Fuel 2026!A3", state: "ready", issues: [], emission_category: "Diesel (gen-set)", global_category_name: "Diesel", activity_value: 100, activity_data_unit: "litres", factor_value: 0.00268, factor_year: 2026, total_emission: 0.268, date_of_reporting: "2026-01-31" },
  { row: 2, row_ref: "Fuel 2026!A4", state: "ready", issues: [{ code: "LOW_CONFIDENCE_MATCH", severity: "warning", message: "Matched below 80 %; check the factor." }], emission_category: "Gasoline 95", global_category_name: "Petrol", activity_value: 50, activity_data_unit: "litres", factor_value: 0.00231, factor_year: 2026, total_emission: 0.1155, date_of_reporting: "2026-01-31" },
  { row: 3, row_ref: "Fuel 2026!A5", state: "issue", issues: [{ code: "SITE_NOT_ALLOWED", severity: "error", message: "This row is for Askar; this upload is for Hidd." }], emission_category: "Diesel (gen-set)", global_category_name: null, activity_value: 20, activity_data_unit: "litres", factor_value: null, total_emission: null, date_of_reporting: "2026-01-31" },
  { row: 4, row_ref: "Fuel 2026!A6", state: "issue", issues: [{ code: "SITE_NOT_ALLOWED", severity: "error", message: "This row is for Askar; this upload is for Hidd." }], emission_category: "Gasoline 95", global_category_name: null, activity_value: 5, activity_data_unit: "litres", factor_value: null, total_emission: null, date_of_reporting: "2026-02-28" },
  { row: 5, row_ref: "Power!B2", state: "ready", issues: [{ code: "PIVOT_EMPTY_CELL", severity: "info", message: "Mar was blank; no row made." }], emission_category: "Grid electricity", global_category_name: "Grid electricity", activity_value: 1200, activity_data_unit: "kWh", factor_value: 0.0005, factor_year: 2026, total_emission: 0.6, date_of_reporting: "2026-01-31" },
];

function planFor(version: number, skippedOtherSite: boolean) {
  const issue = skippedOtherSite ? 0 : 2;
  return {
    plan_id: PLAN_ID,
    version,
    status: "draft",
    counts: { rows: 5, ready: 3, issue, skipped: skippedOtherSite ? 2 : 0, warnings: 1 },
    totals: {
      tco2e: 0.9835,
      by_category: [
        { category_id: 1, name: "Fuel", scope: "Scope 1", tco2e: 0.3835, rows: 2 },
        { category_id: 3, name: "Electricity", scope: "Scope 2", tco2e: 0.6, rows: 1 },
      ],
      by_month: [{ month: "2026-01", tco2e: 0.9835 }],
    },
    issues_summary: [
      ...(skippedOtherSite ? [] : [{ code: "SITE_NOT_ALLOWED", count: 2, example_row_refs: ["Fuel 2026!A5", "Fuel 2026!A6"] }]),
      { code: "LOW_CONFIDENCE_MATCH", count: 1, example_row_refs: ["Fuel 2026!A4"] },
      { code: "PIVOT_EMPTY_CELL", count: 1, example_row_refs: ["Power!B2"] },
    ],
    expires_at: "2026-10-15T00:00:00.000Z",
  };
}

type Call = { method: string; path: string; body: unknown; query: string };

async function signIn(page: Page, role: string, user: object, companySites = [HIDD], profiles: (typeof MOCK_PROFILE)[] = []) {
  const calls: Call[] = [];
  const state = { version: 1, skippedOtherSite: false, profiles: [...profiles], forgetRefusals: 1 };
  await page.addInitScript(
    ([r, u]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [role, JSON.stringify(user)],
  );
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body, headers: { "access-control-allow-origin": "*" } });
      if (request.method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
      }
      const body = request.method() === "GET" || path.endsWith("/upload") ? null : request.postDataJSON();
      calls.push({ method: request.method(), path, body, query: url.search });

      if (path.startsWith("/v1/excel/")) {
        if (path.endsWith("/upload")) return json({ document_id: 42, headers: HEADERS });
        if (path.endsWith("/propose")) return json(MOCK_PROPOSAL);
        if (path.endsWith("/preview")) {
          const b = body as { code?: string };
          const rows = ROWS.map((r) => (state.skippedOtherSite && r.issues.some((i) => i.code === "SITE_NOT_ALLOWED") ? { ...r, state: "skipped" } : r)).filter((r) => !b.code || r.issues.some((i) => i.code === b.code));
          return json({ plan: planFor(state.version, state.skippedOtherSite), rows, total_rows: rows.length, page: 1, page_size: 100, not_selected: 0, sheet_rows: 60 });
        }
        if (path.endsWith("/import")) {
          return json({ inserted: 3, fera_inserted: 0, skipped: 2, skipped_rows: [{ row: 3, emission_category: "Diesel (gen-set)", reason: "Other site" }, { row: 4, emission_category: "Gasoline 95", reason: "Other site" }], total_rows: 5, upload_batch_id: "b-9", plan_id: PLAN_ID, plan: { ...planFor(state.version, true), status: "committed" } });
        }
      }
      if (path === `/imports/plans/${PLAN_ID}`) {
        if (request.method() === "PATCH") {
          state.version += 1;
          const changes = (body as { changes?: { skip?: boolean }[] }).changes ?? [];
          if (changes.length === 2 && changes.every((c) => c.skip)) state.skippedOtherSite = true;
          return json({ ...planFor(state.version, state.skippedOtherSite), rows: [] });
        }
        const code = url.searchParams.get("code");
        const rows = ROWS.filter((r) => !code || r.issues.some((i) => i.code === code)).map((r) => ({ row_ref: r.row_ref, state: r.state }));
        return json({ ...planFor(state.version, state.skippedOtherSite), rows, page: 1, page_size: 200, total_rows: rows.length });
      }
      if (path === "/imports/mapping-profiles") {
        const fp = url.searchParams.get("fingerprint");
        return json(state.profiles.filter((p) => p.fingerprint === fp && String(p.site_id) === url.searchParams.get("site_id")));
      }
      if (path.startsWith("/imports/mapping-profiles/") && request.method() === "DELETE") {
        if (state.forgetRefusals-- > 0) return json({ code: "IMPORT_FORBIDDEN", message: "Forbidden" }, 403);
        const id = decodeURIComponent(path.split("/").pop() as string);
        state.profiles = state.profiles.filter((p) => p.id !== id);
        return json({ id, deleted: true });
      }
      if (path.endsWith("/imports/context/activities")) {
        return json([
          { name: "Diesel", kind: "factor", units: ["litres"], latest_year: 2026 },
          { name: "Petrol", kind: "factor", units: ["litres"], latest_year: 2026 },
        ]);
      }
      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/sites")) return json(companySites);
      return json({});
    },
  );
  return calls;
}

const WORKBOOK = { name: "midal-2026.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("x") };

test("a manager uploads a workbook, confirms the mapping, skips the other site's rows and imports", async ({ page }) => {
  const calls = await signIn(page, "Manager", MANAGER);
  await page.goto("/capture/upload");
  await expect(page.getByRole("heading", { name: "Smart import" })).toBeVisible();
  await expect(page.getByLabel("Client")).toHaveCount(0);
  // One site: picked already.
  await expect(page.getByRole("combobox", { name: "Site" })).toHaveValue("Hidd");
  await expect(page).toHaveURL(/site=1/);

  const next = page.getByRole("button", { name: "Upload and work out the mapping" });
  await expect(next).toBeDisabled();
  await page.locator('input[type="file"]').setInputFiles(WORKBOOK);
  await next.click();

  // Confirm mapping: one card per sheet; the fuel sheet still has two things to check.
  await expect(page.locator("[aria-current=step]")).toContainText("Confirm mapping");
  expect(calls.find((c) => c.path.endsWith("/propose"))?.body).toEqual({ document_id: 42, site_id: 1 });
  await expect(page.getByRole("heading", { name: "Fuel 2026" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Power" })).toBeVisible();
  await expect(page.getByText("Askar: its rows will be skipped (this upload is for Hidd)")).toBeVisible();
  await expect(page.getByText("The sheet names Plant 9, which you cannot import into.", { exact: false })).toBeVisible();
  await expect(page.getByText('Still to check: Unit, "Gasoline 95".')).toBeVisible();
  const cont = page.getByRole("button", { name: "Continue to the rows" });
  await expect(cont).toBeDisabled();
  await expect(page.getByText("Remembered", { exact: true }).first()).toBeVisible();

  const unit = page.getByRole("combobox", { name: "Column for Unit in Fuel 2026" });
  await unit.click();
  await unit.fill("UoM");
  await page.getByRole("option", { name: "UoM" }).click();
  await page.getByRole("button", { name: "Confirm Gasoline 95" }).click();
  await expect(page.getByText("Still to check:", { exact: false })).toHaveCount(0);
  await expect(cont).toBeEnabled();
  await cont.click();

  // Review rows: ESG-lite's plan for the confirmed proposal.
  await expect(page.locator("[aria-current=step]")).toContainText("Review rows");
  const preview = calls.find((c) => c.path.endsWith("/preview"))?.body as { proposal: typeof MOCK_PROPOSAL; plan_id?: string };
  expect(preview.plan_id).toBeUndefined();
  expect(preview.proposal.sheets[0].fields.find((f) => f.key === "activity_unit")).toMatchObject({ column: "UoM", confidence: 1 });
  expect(preview.proposal.sheets[0].activities[1]).toMatchObject({ factor_name: "Petrol", confidence: 1 });
  await expect(page.getByText("2 rows can't be imported as they are")).toBeVisible();
  const table = page.getByRole("table", { name: "Rows of the plan" });
  await expect(table.getByRole("row")).toHaveCount(6);
  await expect(table).toContainText("Note");
  await expect(table).toContainText("Imports with a note");
  // Rows with issues are left out at import, so importing is possible before they're skipped.
  await expect(page.getByRole("button", { name: "Import 3 rows" })).toBeEnabled();

  await page.getByLabel("Issue").selectOption("SITE_NOT_ALLOWED");
  await expect(table.getByRole("row")).toHaveCount(3);
  await page.getByRole("button", { name: "Skip all 2 rows with this issue" }).click();
  // The row refs are read from ESG-lite first, then patched in one call at the plan's version.
  await expect.poll(() => calls.find((c) => c.method === "PATCH")?.body).toEqual({ version: 1, changes: [{ row_ref: "Fuel 2026!A5", skip: true }, { row_ref: "Fuel 2026!A6", skip: true }] });
  await page.getByLabel("Issue").selectOption("");
  await expect(table.getByRole("row")).toHaveCount(6);
  await expect(table).toContainText("Skipped");
  await expect(page.getByRole("button", { name: "Import 3 rows" })).toBeEnabled();
  await page.getByRole("button", { name: "Import 3 rows" }).click();

  // Import: committed at the plan's current version, with Review rows for the batch.
  await expect(page.getByText("Imported 3 rows.")).toBeVisible();
  const sent = calls.find((c) => c.path.endsWith("/import"))?.body as Record<string, unknown>;
  expect(sent).toMatchObject({ document_id: 42, site_id: 1, plan_id: PLAN_ID, version: 2 });
  expect((sent.proposal as { sheets: unknown[] }).sheets).toHaveLength(2);
  await expect(page.getByRole("link", { name: "Review rows" })).toHaveAttribute("href", "/data/approvals?period=all&site=1&category=all&batch=b-9");
});

test("the confirm screen fits 390px without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "Manager", MANAGER);
  await page.goto("/capture/upload");
  await page.locator('input[type="file"]').setInputFiles(WORKBOOK);
  await page.getByRole("button", { name: "Upload and work out the mapping" }).click();
  await expect(page.getByRole("heading", { name: "Fuel 2026" })).toBeVisible();
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1]);
});

test("with the client switch off a manager keeps the column mapper and sees why", async ({ page }) => {
  const off = { ...HIDD, company: { ...COMPANY_ON, ai_import_enabled: false } };
  await signIn(page, "Manager", { ...MANAGER, sites: [off] }, [off]);
  await page.goto("/capture/upload");
  await expect(page.getByRole("heading", { name: "Bulk upload" })).toBeVisible();
  await expect(page.getByText("Smart import is off for your organisation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Smart import" })).toHaveCount(0);
  await expect(page.getByLabel("Category")).toBeVisible();
});

test("a superadmin sees the switch per client and can fall back to the manual mapper", async ({ page }) => {
  const pune = { site_id: 2, name: "Pune", company: { company_id: 2, name: "Gulf Foods", ai_import_enabled: false }, categories: [] };
  await signIn(page, "Superadmin", { user_id: 9, name: "Sam Staff", email: "sam@example.com" }, [HIDD, pune]);
  // No client yet: the column mapper, with Smart import a click away.
  await page.goto("/capture/upload");
  await expect(page.getByRole("heading", { name: "Bulk upload" })).toBeVisible();
  // A link to a client with the switch on opens Smart import.
  await page.goto("/capture/upload?client=1");
  await expect(page.getByRole("heading", { name: "Smart import" })).toBeVisible();
  await page.getByLabel("Client").selectOption({ label: "Gulf Foods" });
  await expect(page.getByRole("heading", { name: "Smart import" })).toBeVisible();
  await expect(page.getByText("Smart import is off for this client")).toBeVisible();
  await page.getByRole("button", { name: "Manual upload" }).click();
  await expect(page).toHaveURL(/mode=manual/);
  await expect(page.getByRole("heading", { name: "Bulk upload" })).toBeVisible();
  await page.getByRole("button", { name: "Smart import" }).click();
  await expect(page.getByRole("heading", { name: "Smart import" })).toBeVisible();
});

test("a remembered mapping is shown on its sheet, can be used and can be forgotten", async ({ page }) => {
  const calls = await signIn(page, "Manager", MANAGER, [HIDD], [MOCK_PROFILE]);
  await page.goto("/capture/upload");
  await page.locator('input[type="file"]').setInputFiles(WORKBOOK);
  await page.getByRole("button", { name: "Upload and work out the mapping" }).click();
  await expect(page.getByRole("heading", { name: "Fuel 2026" })).toBeVisible();

  // One read per sheet fingerprint, for the upload's site, with the user's own token (no client id).
  await expect.poll(() => calls.filter((c) => c.path === "/imports/mapping-profiles").length).toBe(2);
  const reads = calls.filter((c) => c.path === "/imports/mapping-profiles");
  expect(reads.map((c) => c.query).sort()).toEqual([`?fingerprint=${MOCK_PROPOSAL.sheets[0].fingerprint}&site_id=1`, `?fingerprint=${MOCK_PROPOSAL.sheets[1].fingerprint}&site_id=1`]);
  const fuelCard = page.getByRole("region", { name: "Fuel 2026" });
  const line = fuelCard.getByText("Last time you mapped this as…");
  await expect(line).toBeVisible();
  await expect(fuelCard).toContainText('Unit from "UoM"');
  await expect(fuelCard).toContainText("on 12 Sep 2026, used 3 times");
  await expect(page.getByRole("region", { name: "Power" }).getByText("Last time you mapped this as…")).toHaveCount(0);
  await expect(page.getByText('Still to check: Unit, "Gasoline 95".')).toBeVisible();

  // Use it: the card takes the remembered mapping, nothing is left to check.
  await page.getByRole("button", { name: "Use the remembered mapping for Fuel 2026" }).click();
  await expect(page.getByText("Still to check:", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Column for Unit in Fuel 2026" })).toHaveValue("UoM");
  await expect(page.getByRole("button", { name: "Use the remembered mapping for Fuel 2026" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue to the rows" })).toBeEnabled();

  // Forget: refused once (not the person who confirmed it), then gone.
  const forget = page.getByRole("button", { name: "Forget the remembered mapping for Fuel 2026" });
  await forget.click();
  await expect(fuelCard.getByRole("alert")).toHaveText("Only the person who confirmed this mapping, or an admin, can forget it.");
  await forget.click();
  await expect(line).toHaveCount(0);
  const deletes = calls.filter((c) => c.method === "DELETE");
  expect(deletes.map((c) => c.path)).toEqual([`/imports/mapping-profiles/${MOCK_PROFILE.id}`, `/imports/mapping-profiles/${MOCK_PROFILE.id}`]);
  // The mapping taken from the profile stays on the card.
  await expect(page.getByRole("combobox", { name: "Column for Unit in Fuel 2026" })).toHaveValue("UoM");
});

test("a superadmin reads the chosen client's remembered mappings", async ({ page }) => {
  const calls = await signIn(page, "Superadmin", { user_id: 9, name: "Sam Staff", email: "sam@example.com" }, [HIDD], [MOCK_PROFILE]);
  await page.goto("/capture/upload?client=1&site=1");
  await expect(page.getByRole("heading", { name: "Smart import" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(WORKBOOK);
  await page.getByRole("button", { name: "Upload and work out the mapping" }).click();
  await expect(page.getByRole("region", { name: "Fuel 2026" }).getByText("Last time you mapped this as…")).toBeVisible();
  expect(calls.find((c) => c.path === "/imports/mapping-profiles")?.query).toBe(`?fingerprint=${MOCK_PROPOSAL.sheets[0].fingerprint}&site_id=1&company_id=1`);
});

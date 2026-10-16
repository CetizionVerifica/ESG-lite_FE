import { type Page, expect, test } from "@playwright/test";

/**
 * P07 Approvals and Emissions ledger smoke tests. The
 * API is answered locally from an in-memory list, and every review request is
 * recorded so the tests can check what reached the server.
 */

type Row = {
  pk_id: number;
  status: "pending" | "approved" | "rejected";
  activity_data: Record<string, unknown>;
  // The API sends numeric columns as strings, e.g. "0.8040".
  total_emission: string;
  category: { category_id: number; category_name: string; scope: string | null };
  review_comment?: string;
  // Defaults to "litre"; null for an entry stored without a unit.
  activity_data_unit?: string | null;
  upload_batch_id?: string | null;
  // S3-15 review checks; null = not checked yet.
  checks?: { ready: boolean; held: string[] } | null;
};

const company = { company_id: 1, name: "Midal Cables" };
const user = {
  name: "Mia Manager",
  email: "mia@example.com",
  sites: [{ site_id: 1, name: "Hidd", company, categories: [{ category_id: 10, category_name: "Diesel" }, { category_id: 20, category_name: "Electricity" }] }],
};

function makeRows(): Row[] {
  const diesel = { category_id: 10, category_name: "Diesel", scope: "Scope 1" };
  return [1, 2, 3].map((n) => ({
    pk_id: n,
    status: "pending",
    activity_data: { fuel_type: "1", quantity: String(100 * n), emission_category: "Diesel (average biofuel blend)" },
    total_emission: (0.268 * n).toFixed(4),
    category: diesel,
    // Rows 1 and 2 came in Claude's batch b-2; row 3 was typed in. Row 2 was matched below 80 % (XI5).
    upload_batch_id: n < 3 ? "b-2" : null,
    extra_data: n < 3 ? { import: { channel: "mcp", row_ref: `Fuel!A${n + 1}`, ...(n === 2 && { meta: { source: "llm", confidence: 0.64 } }) } } : undefined,
    // Row 1 passes every check; row 2 the smart import was unsure of; row 3 has no evidence and jumped.
    checks: n === 1 ? { ready: true, held: [] } : n === 2 ? { ready: false, held: ["IMPORT_MATCH_SURE"] } : { ready: false, held: ["EVIDENCE_ATTACHED", "WITHIN_THRESHOLD"] },
  }));
}

const config = [
  {
    columns: [
      { pk_id: 5, column_name: "fuel_type", column_type: "select" },
      { pk_id: 7, column_name: "quantity", column_type: "number" },
    ],
    column_options: { "5": [{ id: 1, label: "Ultra low sulphur diesel" }] },
  },
];

async function signIn(page: Page) {
  const rows = makeRows();
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  // Every list request's query (limit > 1), to check what the page fetched.
  const lists: URLSearchParams[] = [];
  // `attention: false` plays an ESG-lite without XI5: no count in the summary and the filter ignored.
  // `checks: false` plays an ESG-lite without S3-15: no checks on rows, no ready counts.
  const api = { attention: true, checks: true };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (body: unknown) => route.fulfill({ json: body });
      if (method !== "GET") calls.push({ method, path, body: request.postDataJSON() });

      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.includes("/user/column-configs/")) return json(config);
      if (path.includes("/user/documents/emission/")) return json([]);
      if (path.endsWith("/user/audit-logs")) return json([]);
      if (path.includes("/user/thresholds/company/")) return json({ threshold_percentage: 5 });
      if (path.endsWith("/user/emissions/bulk-approve")) {
        const body = request.postDataJSON() as { ids: number[]; only_ready?: boolean };
        const approved: number[] = [];
        const skipped: { id: number; held: string[] }[] = [];
        for (const id of body.ids) {
          const row = rows.find((r) => r.pk_id === id);
          if (!row || row.status !== "pending") continue;
          if (body.only_ready && !row.checks?.ready) {
            skipped.push({ id, held: row.checks?.held ?? [] });
            continue;
          }
          row.status = "approved";
          approved.push(id);
        }
        return json({ message: "ok", approved, skipped });
      }
      if (path.includes("/user/units/")) return json([{ unit_id: 1, unit_name: "litre" }, { unit_id: 2, unit_name: "m3" }]);
      if (path.endsWith("/user/emissions/batches")) {
        const own = { upload_batch_id: "b-1", count: 40, pending_count: 30, approved_count: 10, rejected_count: 0, uploaded_at: "2025-10-03T09:00:00Z", site_id: 1, site_name: "Hidd", category_id: 10, category_name: "Diesel", uploaded_by: "Omar Contributor" };
        const claude = { ...own, upload_batch_id: "b-2", channel: "mcp", count: 12, pending_count: 12, approved_count: 0, uploaded_at: "2025-10-04T09:00:00Z", category_id: 20, category_name: "Electricity", uploaded_by: "Sam Staff" };
        // Like the real endpoint, no site filter means every company's batches.
        const foreign = { ...own, upload_batch_id: "b-9", site_id: 99, site_name: "Other company site" };
        return json(url.searchParams.get("siteIds") === "1" ? [own, claude] : [own, claude, foreign]);
      }
      if (/\/user\/emissions\/batch\/[^/]+\/(approve|reject)$/.test(path)) return json({ message: "ok" });

      const edit = /\/user\/emissions\/manager-edit\/(\d+)$/.exec(path);
      if (edit) {
        const row = rows.find((r) => r.pk_id === Number(edit[1]))!;
        const body = request.postDataJSON() as { activity_data?: Record<string, unknown> };
        if (body.activity_data) row.activity_data = body.activity_data;
        return json({ emission: row });
      }

      const approve = /\/user\/emissions\/(\d+)\/approve$/.exec(path);
      if (approve) {
        const row = rows.find((r) => r.pk_id === Number(approve[1]))!;
        row.status = "approved";
        return json({ emission: row });
      }
      const reject = /\/user\/emissions\/(\d+)\/reject$/.exec(path);
      if (reject) {
        const row = rows.find((r) => r.pk_id === Number(reject[1]))!;
        row.status = "rejected";
        row.review_comment = (request.postDataJSON() as { comment: string }).comment;
        return json({ emission: row });
      }
      if (path.endsWith("/user/emissions")) {
        const status = url.searchParams.get("status");
        const batchId = url.searchParams.get("batchId");
        const attention = api.attention && batchId && url.searchParams.get("attention") === "1";
        const ready = api.checks ? url.searchParams.get("ready") : null;
        const isReady = (r: Row) => r.checks?.ready === true;
        const needsAttention = (r: Row) => (r.extra_data as { import?: { meta?: unknown } } | undefined)?.import?.meta !== undefined;
        const data = rows
          .filter((r) => !status || r.status === status)
          .filter((r) => !batchId || r.upload_batch_id === batchId)
          .filter((r) => !attention || needsAttention(r))
          .filter((r) => ready === null || (r.status === "pending" && isReady(r) === (ready === "1")))
          .map(({ checks, ...r }) => ({
            ...(api.checks && { checks }),
            ...r,
            unit: "tCO2e",
            activity_data_unit: r.activity_data_unit === undefined ? "litre" : r.activity_data_unit,
            date_of_reporting: (r as { date_of_reporting?: string }).date_of_reporting ?? "2025-09-30",
            created_at: `2025-10-0${r.pk_id}T08:00:00Z`,
            updated_at: "2025-10-01T08:00:00Z",
            site: { site_id: 1, name: "Hidd" },
            created_by: { user_id: 4, name: "Omar Contributor" },
            emission_factor_snapshot: { emission_factor_id: 9, emission_category_name: "Diesel (average biofuel blend)", factor_value: "0.002680", denominator_unit: "litre", source: "DEFRA", year: 2024 },
          }));
        const count = (s: string) => rows.filter((r) => r.status === s && (!batchId || r.upload_batch_id === batchId)).length;
        // Like ESG-lite: the attention count follows the request's filters, status included.
        const attentionCount = api.attention && batchId ? rows.filter((r) => (!status || r.status === status) && r.upload_batch_id === batchId && needsAttention(r)).length : undefined;
        if (url.searchParams.get("limit") !== "1") lists.push(url.searchParams);
        const pendingRows = rows.filter((r) => r.status === "pending" && (!batchId || r.upload_batch_id === batchId));
        const review = api.checks ? { ready: pendingRows.filter(isReady).length, held: pendingRows.filter((r) => !isReady(r)).length } : {};
        return json({ data, total: data.length, summary: { total_emission: 0, pending_count: count("pending"), approved_count: count("approved"), rejected_count: count("rejected"), ...review, ...(attentionCount !== undefined && { attention: attentionCount }) } });
      }
      return json({});
    },
  );
  return { rows, calls, lists, api };
}

test("a manager clears the queue with the keyboard, with undo", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/data/approvals");
  const table = page.getByRole("table", { name: "Entries waiting for approval" });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(page.getByRole("tab", { name: /Approvals/ })).toContainText("3");
  await expect(table).toContainText("Ultra low sulphur diesel");

  // J focuses the first row, A approves it; the row leaves the queue at once.
  await page.locator("body").press("j");
  await expect(table.locator("tbody tr").first()).toBeFocused();
  await page.keyboard.press("a");
  await expect(page.getByText("Entry approved")).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3);

  // Undo puts it back and nothing reaches the server.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(table.getByRole("row")).toHaveCount(4);
  expect(calls.filter((c) => c.path.endsWith("/approve"))).toHaveLength(0);

  // R asks for a reason; a suggested reason is enough.
  await table.locator("tbody tr").nth(1).focus();
  await page.keyboard.press("r");
  const dialog = page.getByRole("alertdialog", { name: "Reject this entry?" });
  await dialog.getByRole("button", { name: "Wrong unit" }).click();
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(dialog).toBeHidden();
  expect(calls).toContainEqual({ method: "PUT", path: "/user/emissions/2/reject", body: { comment: "Wrong unit" } });
  await expect(table.getByRole("row")).toHaveCount(3);

  // Approve again and leave the page: the waiting approval is sent on the way out.
  await table.locator("tbody tr").first().focus();
  await page.keyboard.press("a");
  await page.getByRole("tab", { name: "Ledger" }).click();
  await expect(page).toHaveURL(/\/data\/ledger/);
  await expect.poll(() => calls.filter((c) => c.path === "/user/emissions/1/approve").length).toBe(1);
  await expect(page.getByRole("table", { name: "Emission entries" }).getByRole("row")).toHaveCount(4);
});

test("a row opens in the drawer with its calculation", async ({ page }) => {
  await signIn(page);
  await page.goto("/data/ledger");
  const table = page.getByRole("table", { name: "Emission entries" });
  await table.locator("tbody tr").nth(2).focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Diesel" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId("calculation")).toContainText("300.00 litre");
  await expect(drawer.getByTestId("calculation")).toContainText("0.00268 per litre");
  await expect(drawer).toContainText("DEFRA");
  await expect(drawer).toContainText("No documents attached.");
  await expect(drawer).toContainText("0.804 tCO₂e");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("Clear filters clears the search, status and category together", async ({ page }) => {
  await signIn(page);
  await page.goto("/data/ledger?status=rejected&q=diesel&category=10");
  await expect(page.getByText("No records match")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("table", { name: "Emission entries" }).getByRole("row")).toHaveCount(4);
  const url = new URL(page.url());
  expect(url.searchParams.get("status")).toBeNull();
  expect(url.searchParams.get("q")).toBeNull();
  expect(url.searchParams.get("category")).toBe("all");
});

test("a manager edits an entry from the drawer with a reason", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/data/ledger");
  await page.getByRole("table", { name: "Emission entries" }).locator("tbody tr").first().click();
  const drawer = page.getByRole("dialog", { name: "Diesel" });
  await drawer.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog", { name: "Edit · Diesel" })).toBeVisible();
  await page.getByLabel("Quantity").fill("150");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Say why this changes/)).toBeVisible();
  await expect(page.getByText("Not saved yet: add a reason for the change (at least 5 characters).")).toBeVisible();
  await expect(page.getByLabel("Reason for the change")).toBeFocused();
  expect(calls.some((c) => c.path.includes("manager-edit"))).toBe(false);
  await page.getByLabel("Reason for the change").fill("Meter read corrected");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  // Only the changed values go: the unchanged unit and date stay off the request.
  expect(calls.find((c) => c.path === "/user/emissions/manager-edit/1")?.body).toEqual({
    activity_data: { fuel_type: "1", quantity: "150", emission_category: "Diesel (average biofuel blend)" },
    reason: "Meter read corrected",
  });
});

test("a date-only fix sends just the date", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/data/ledger");
  await page.getByRole("table", { name: "Emission entries" }).locator("tbody tr").first().click();
  await page.getByRole("dialog", { name: "Diesel" }).getByRole("button", { name: "Edit" }).click();
  await page.getByRole("group", { name: "Reporting month" }).getByLabel("Month").selectOption({ label: "Aug" });
  await page.getByLabel("Reason for the change").fill("Wrong reporting month");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  expect(calls.find((c) => c.path === "/user/emissions/manager-edit/1")?.body).toEqual({
    date_of_reporting: "2025-08-31",
    reason: "Wrong reporting month",
  });
});

test("an empty, zero or negative amount isn't sent", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/data/ledger");
  await page.getByRole("table", { name: "Emission entries" }).locator("tbody tr").first().click();
  await page.getByRole("dialog", { name: "Diesel" }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Reason for the change").fill("Meter read corrected");
  for (const amount of ["", "0", "-5"]) {
    await page.getByLabel("Quantity").fill(amount);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Not saved yet: enter an amount greater than 0.")).toBeVisible();
    await expect(page.getByLabel("Quantity")).toBeFocused();
  }
  await expect(page.getByText("Enter an amount greater than 0", { exact: true })).toBeVisible();
  expect(calls.some((c) => c.path.includes("manager-edit"))).toBe(false);
  await page.getByLabel("Quantity").fill("150");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
});

test("a date the server refuses (filed yearly) shows its reason and keeps the form", async ({ page }) => {
  await signIn(page);
  const message = "This category already has a yearly batch covering 2024-04-01 – 2025-03-31. Delete the yearly data first, or file this entry under a different period.";
  await page.route(/\/user\/emissions\/manager-edit\//, (route) => route.fulfill({ status: 409, json: { message, mode_lock: true } }));
  await page.goto("/data/ledger");
  await page.getByRole("table", { name: "Emission entries" }).locator("tbody tr").first().click();
  await page.getByRole("dialog", { name: "Diesel" }).getByRole("button", { name: "Edit" }).click();
  // Mar 2025 falls in an FY 2024-25 yearly batch.
  await page.getByRole("group", { name: "Reporting month" }).getByLabel("Month").selectOption({ label: "Mar" });
  await page.getByLabel("Reason for the change").fill("Wrong reporting month");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Edit · Diesel" })).toBeVisible();
});

test("an amount change on an entry without a unit waits for a unit", async ({ page }) => {
  const { rows, calls } = await signIn(page);
  rows[0].activity_data_unit = null;
  await page.goto("/data/ledger");
  await page.getByRole("table", { name: "Emission entries" }).locator("tbody tr").first().click();
  await page.getByRole("dialog", { name: "Diesel" }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Quantity").fill("150");
  await page.getByLabel("Reason for the change").fill("Meter read corrected");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Not saved yet: choose a unit, without one the total would be 0.")).toBeVisible();
  await expect(page.getByLabel("Unit")).toBeFocused();
  expect(calls.some((c) => c.path.includes("manager-edit"))).toBe(false);
  await page.getByLabel("Unit").selectOption("litre");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  expect(calls.find((c) => c.path === "/user/emissions/manager-edit/1")?.body).toEqual({
    activity_data: { fuel_type: "1", quantity: "150", emission_category: "Diesel (average biofuel blend)" },
    activity_data_unit: "litre",
    reason: "Meter read corrected",
  });
});

test("a date-only fix on an entry without a unit sends just the date", async ({ page }) => {
  const { rows, calls } = await signIn(page);
  rows[0].activity_data_unit = null;
  await page.goto("/data/ledger");
  await page.getByRole("table", { name: "Emission entries" }).locator("tbody tr").first().click();
  await page.getByRole("dialog", { name: "Diesel" }).getByRole("button", { name: "Edit" }).click();
  await page.getByRole("group", { name: "Reporting month" }).getByLabel("Month").selectOption({ label: "Aug" });
  await page.getByLabel("Reason for the change").fill("Wrong reporting month");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  expect(calls.find((c) => c.path === "/user/emissions/manager-edit/1")?.body).toEqual({
    date_of_reporting: "2025-08-31",
    reason: "Wrong reporting month",
  });
});

test("the period is a month in the entry's own year, saved as its last day", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/data/ledger");
  await page.getByRole("table", { name: "Emission entries" }).locator("tbody tr").first().click();
  await page.getByRole("dialog", { name: "Diesel" }).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Date of reporting")).toHaveCount(0);
  const month = page.getByRole("group", { name: "Reporting month" });
  // Another year would be recalculated with the stored date's factor year.
  await expect(month.getByLabel("Year").locator("option")).toHaveText(["2025"]);
  await month.getByLabel("Month").selectOption({ label: "Feb" });
  await page.getByLabel("Reason for the change").fill("Wrong reporting month");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  expect(calls.find((c) => c.path === "/user/emissions/manager-edit/1")?.body).toEqual({
    date_of_reporting: "2025-02-28",
    reason: "Wrong reporting month",
  });
});

test("a yearly entry shows its period, which the edit doesn't change", async ({ page }) => {
  const { rows } = await signIn(page);
  Object.assign(rows[0], { reporting_period: "yearly", year_type: "FY", date_of_reporting: "2026-03-31" });
  await page.goto("/data/ledger");
  await page.getByRole("table", { name: "Emission entries" }).locator("tbody tr").filter({ hasText: "FY 2025-26" }).click();
  await page.getByRole("dialog", { name: "Diesel" }).getByRole("button", { name: "Edit" }).click();
  const form = page.getByRole("dialog", { name: "Edit · Diesel" });
  await expect(form).toContainText("Yearly · FY 2025-26");
  await expect(form.getByRole("group", { name: "Reporting month" })).toHaveCount(0);
});

test("clearing the unit blocks the save", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/data/ledger");
  await page.getByRole("table", { name: "Emission entries" }).locator("tbody tr").first().click();
  await page.getByRole("dialog", { name: "Diesel" }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Unit").selectOption("");
  await page.getByLabel("Reason for the change").fill("Unit was wrong");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Not saved yet: choose a unit, without one the total would be 0.")).toBeVisible();
  await expect(page.getByLabel("Unit")).toBeFocused();
  expect(calls.some((c) => c.path.includes("manager-edit"))).toBe(false);
});

test("rejecting a batch with approved rows needs an explicit tick", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/data/approvals");
  await page.getByRole("tab", { name: /Upload batches/ }).click();
  await expect(page).toHaveURL(/view=batches/);
  const table = page.getByRole("table", { name: "Upload batches" });
  await expect(table).toContainText("30 pending · 10 approved");
  await expect(table).not.toContainText("Other company site");
  await table.getByRole("row", { name: /Diesel/ }).getByRole("button", { name: "Reject…" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Reject 30 rows?" });
  await dialog.getByLabel("Reason").fill("Wrong month in the sheet");
  await expect(dialog.getByRole("button", { name: "Reject", exact: true })).toBeDisabled();
  await dialog.getByLabel(/Reject the 10 approved rows too/).check();
  await expect(page.getByRole("alertdialog", { name: "Reject 40 rows?" })).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByText("Batch rejected")).toBeVisible();
  expect(calls).toContainEqual({ method: "PUT", path: "/user/emissions/batch/b-1/reject", body: { comment: "Wrong month in the sheet" } });
});

test("upload batches show their source and filter by it", async ({ page }) => {
  await signIn(page);
  await page.goto("/data/approvals?view=batches");
  const table = page.getByRole("table", { name: "Upload batches" });
  await expect(table.getByRole("row", { name: /Diesel/ })).toContainText("Bulk upload");
  await expect(table.getByRole("row", { name: /Electricity/ })).toContainText("Claude");
  await page.getByLabel("Source").selectOption("claude");
  await expect(page).toHaveURL(/source=claude/);
  await expect(table.getByRole("row", { name: /Hidd/ })).toHaveCount(1);
  await expect(table).toContainText("Sam Staff");
  await page.getByLabel("Source").selectOption("api");
  await expect(page.getByText("No API batches")).toBeVisible();
  await page.getByRole("button", { name: "All sources" }).click();
  await expect(table.getByRole("row", { name: /Hidd/ })).toHaveCount(2);
});

test("Review rows opens the approvals queue with only that batch's rows, one by one", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/data/approvals?view=batches");
  const batches = page.getByRole("table", { name: "Upload batches" });
  await batches.getByRole("row", { name: /Electricity/ }).getByRole("link", { name: "Review rows" }).click();
  await expect(page).toHaveURL(/\/data\/approvals\?/);
  await expect(page).toHaveURL(/batch=b-2/);
  await expect(page).toHaveURL(/site=1/);
  await expect(page).toHaveURL(/category=20/);
  await expect(page.getByRole("status").filter({ hasText: "Showing the pending rows of one upload batch" })).toBeVisible();
  const queue = page.getByRole("table", { name: "Entries waiting for approval" });
  // The batch has one row that needs attention (XI5), so that chip is on and the row comes first.
  await expect(page.getByRole("button", { name: "Needs attention (1)" })).toHaveAttribute("aria-pressed", "true");
  await expect(queue.getByRole("row", { name: /Diesel · Hidd/ })).toHaveCount(1);
  await expect(page.getByRole("tab", { name: /Approvals/ })).toContainText("2");

  // Each row is still reviewed on its own: A approves the focused row only.
  await queue.locator("tbody tr").first().focus();
  await page.keyboard.press("a");
  await expect(page.getByText("Entry approved")).toBeVisible();
  await expect(queue.getByRole("row", { name: /Diesel · Hidd/ })).toHaveCount(0);
  expect(calls.filter((c) => c.path.endsWith("/batch/b-2/approve"))).toHaveLength(0);

  await page.getByRole("button", { name: "Show all rows" }).click();
  await expect(page).not.toHaveURL(/batch=/);
  await expect(page.getByRole("status").filter({ hasText: "one upload batch" })).toHaveCount(0);
  await expect(queue.getByRole("row", { name: /Diesel · Hidd/ })).toHaveCount(2);
});

test("an upload notification's link lands on its batch, and a missing batch says so", async ({ page }) => {
  await signIn(page);
  await page.goto("/data/approvals?view=batches&batch=b-1");
  const table = page.getByRole("table", { name: "Upload batches" });
  const row = table.getByRole("row", { name: /Diesel/ });
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(row).toBeFocused();

  await page.goto("/data/approvals?view=batches&batch=b-gone");
  await expect(page.getByRole("status").filter({ hasText: "That upload batch isn't in this list" })).toBeVisible();
  await expect(table.getByRole("row", { name: /Diesel/ })).not.toHaveAttribute("aria-current", "true");
});

test("Review rows shows the rows that need attention first, with how each was matched", async ({ page }) => {
  await signIn(page);
  await page.goto("/data/approvals?site=1&category=20&period=all&batch=b-2");
  // The chip is on by itself while the batch has such rows.
  const chip = page.getByRole("button", { name: "Needs attention (1)" });
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: "rows of one upload batch that need attention" })).toBeVisible();
  const queue = page.getByRole("table", { name: "Entries waiting for approval" });
  await expect(queue.getByRole("row", { name: /Diesel · Hidd/ })).toHaveCount(1);

  await queue.getByRole("row", { name: /Diesel · Hidd/ }).first().click();
  await expect(page.getByTestId("drawer-provenance")).toHaveText("Imported from Fuel!A3 · Matched by: suggested (64 %)");
  await page.keyboard.press("Escape");

  await chip.click();
  await expect(page).toHaveURL(/attention=0/);
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(queue.getByRole("row", { name: /Diesel · Hidd/ })).toHaveCount(2);
});

test("the attention chip counts pending rows only, and the list loads once with it", async ({ page }) => {
  const { rows, lists } = await signIn(page);
  await page.goto("/data/approvals?site=1&category=20&period=all&batch=b-2");
  await expect(page.getByRole("button", { name: "Needs attention (1)" })).toHaveAttribute("aria-pressed", "true");
  const batchLists = lists.filter((q) => q.get("batchId") === "b-2");
  expect(batchLists.length).toBeGreaterThan(0);
  expect(batchLists.every((q) => q.get("attention") === "true" || q.get("attention") === "1")).toBe(true);

  // Once the low-confidence row is approved, the pending queue has none: no chip, both other rows show.
  rows.find((r) => r.pk_id === 2)!.status = "approved";
  await page.reload();
  const queue = page.getByRole("table", { name: "Entries waiting for approval" });
  await expect(queue.getByRole("row", { name: /Diesel · Hidd/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Needs attention/ })).toHaveCount(0);
});

test("an API without the attention count shows no chip, even with ?attention=1", async ({ page }) => {
  const { api } = await signIn(page);
  api.attention = false;
  await page.goto("/data/approvals?site=1&category=20&period=all&batch=b-2&attention=1");
  const queue = page.getByRole("table", { name: "Entries waiting for approval" });
  await expect(queue.getByRole("row", { name: /Diesel · Hidd/ })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Needs attention/ })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "need attention" })).toHaveCount(0);
});

test("Approve pending names the rows that need attention and offers to review them first", async ({ page }) => {
  await signIn(page);
  await page.goto("/data/approvals?view=batches");
  const batches = page.getByRole("table", { name: "Upload batches" });
  await batches.getByRole("row", { name: /Electricity/ }).getByRole("button", { name: "Approve pending" }).click();
  await expect(page.getByRole("dialog", { name: "Approve all 12 pending rows?" })).toBeVisible();
  await expect(page.getByText("1 of 12 pending rows was matched by the smart import below 80 %", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve all" })).toBeVisible();
  await page.getByRole("button", { name: "Review them first" }).click();
  await expect(page).toHaveURL(/batch=b-2/);
  await expect(page).toHaveURL(/attention=1/);
  await expect(page.getByRole("button", { name: "Needs attention (1)" })).toHaveAttribute("aria-pressed", "true");
});

test("a manager approves every ready entry with the keyboard, with undo (S3-15)", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/data/approvals");
  const table = page.getByRole("table", { name: "Entries waiting for approval" });
  await expect(table.getByRole("row")).toHaveCount(4);
  const groups = page.getByRole("group", { name: "Review groups" });
  await expect(groups.getByRole("button", { name: "Needs attention (2)" })).toBeVisible();
  await expect(groups.getByRole("button", { name: "Ready (1)" })).toBeVisible();
  await expect(page.getByTestId("shortcuts")).toContainText("J/K move");

  // Reason chips, word and icon, on each held row.
  await expect(table.locator("tbody tr").nth(1)).toContainText("Smart import unsure");
  await expect(table.locator("tbody tr").nth(2)).toContainText("No evidence");
  await expect(table.locator("tbody tr").nth(2)).toContainText("Over your 5 % change limit");
  await expect(table.locator("tbody tr").first()).toContainText("Ready");

  // ?group= narrows the list.
  await groups.getByRole("button", { name: "Needs attention (2)" }).click();
  await expect(page).toHaveURL(/group=attention/);
  await expect(table.getByRole("row")).toHaveCount(3);
  await groups.getByRole("button", { name: "Needs attention (2)" }).click();
  await expect(page).not.toHaveURL(/group=/);

  // The sticky bar, by keyboard: focus and Enter. The ready row leaves at once; Undo sends nothing.
  const approveAll = page.getByRole("button", { name: "Approve all 1 ready" });
  await approveAll.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("1 ready entry approved")).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(table.getByRole("row")).toHaveCount(4);
  expect(calls.filter((c) => c.path.endsWith("/bulk-approve"))).toHaveLength(0);

  // Again, and let the window close: one request, only the ready id, only_ready set.
  await page.getByRole("button", { name: "Approve all 1 ready" }).focus();
  await page.keyboard.press("Enter");
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect.poll(() => calls.filter((c) => c.path.endsWith("/bulk-approve")).length, { timeout: 15_000 }).toBe(1);
  expect(calls.find((c) => c.path.endsWith("/bulk-approve"))?.body).toEqual({ ids: [1], only_ready: true });
  await expect(page.getByRole("button", { name: /Approve all \d+ ready/ })).toHaveCount(0);
});

test("a held entry opens as a single-entry review with Why held (S3-15)", async ({ page }) => {
  await signIn(page);
  await page.goto("/data/approvals?group=attention");
  const table = page.getByRole("table", { name: "Entries waiting for approval" });
  await expect(table.getByRole("row")).toHaveCount(3);
  await table.locator("tbody tr").nth(1).focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Diesel" });
  const why = drawer.getByTestId("why-held");
  await expect(why).toContainText("Held back by 2 checks.");
  await expect(why.locator('[data-check="EVIDENCE_ATTACHED"]')).toHaveAttribute("data-passed", "false");
  await expect(why.locator('[data-check="WITHIN_THRESHOLD"]')).toContainText("Over your 5 % change limit");
  await expect(why.locator('[data-check="FACTOR_FOUND"]')).toContainText("Factor found for 2024"); // a 2025 entry uses 2024 factors
  await expect(why.locator('[data-check="METHOD_GIVEN"]')).toHaveAttribute("data-passed", "true");
  await expect(drawer.getByTestId("calculation")).toBeVisible();
  await expect(drawer.getByText("Last 6 months")).toBeVisible();

  // A reason chip opens the reject dialog with that reason; Esc closes it.
  await drawer.getByRole("group", { name: "Reject with a reason" }).getByRole("button", { name: "Missing invoice" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Reject this entry?" });
  await expect(dialog.getByRole("textbox", { name: "Reason" })).toHaveValue("Missing invoice");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Approve and next opens the next entry waiting.
  await drawer.getByRole("button", { name: "Approve and next" }).click();
  await expect(page.getByText("Entry approved")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Diesel" }).getByTestId("why-held")).toContainText("Held back by 1 check.");
});

test("an API without review checks shows no groups and no approve-all bar", async ({ page }) => {
  const { api } = await signIn(page);
  api.checks = false;
  await page.goto("/data/approvals?group=ready");
  const table = page.getByRole("table", { name: "Entries waiting for approval" });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(page.getByRole("group", { name: "Review groups" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Approve all \d+ ready/ })).toHaveCount(0);
  await expect(table.getByRole("columnheader", { name: "Why it's held" })).toHaveCount(0);
});

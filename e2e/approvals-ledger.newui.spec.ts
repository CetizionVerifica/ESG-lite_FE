import { type Page, expect, test } from "@playwright/test";

/**
 * P07 Approvals and Emissions ledger smoke tests (VITE_NEW_UI=1 server). The
 * API is answered locally from an in-memory list, and every review request is
 * recorded so the tests can check what reached the server.
 */

type Row = {
  pk_id: number;
  status: "pending" | "approved" | "rejected";
  activity_data: Record<string, unknown>;
  total_emission: number;
  category: { category_id: number; category_name: string; scope: string | null };
  review_comment?: string;
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
    total_emission: 0.268 * n,
    category: diesel,
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
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4174",
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
      if (path.includes("/user/units/")) return json([{ unit_id: 1, unit_name: "litre" }, { unit_id: 2, unit_name: "m3" }]);
      if (path.endsWith("/user/emissions/batches")) {
        const own = { upload_batch_id: "b-1", count: 40, pending_count: 30, approved_count: 10, rejected_count: 0, uploaded_at: "2025-10-03T09:00:00Z", site_id: 1, site_name: "Hidd", category_id: 10, category_name: "Diesel", uploaded_by: "Omar Contributor" };
        // Like the real endpoint, no site filter means every company's batches.
        const foreign = { ...own, upload_batch_id: "b-9", site_id: 99, site_name: "Other company site" };
        return json(url.searchParams.get("siteIds") === "1" ? [own] : [own, foreign]);
      }
      if (/\/user\/emissions\/batch\/[^/]+\/(approve|reject)$/.test(path)) return json({ message: "ok" });

      const edit = /\/user\/emissions\/manager-edit\/(\d+)$/.exec(path);
      if (edit) {
        const row = rows.find((r) => r.pk_id === Number(edit[1]))!;
        row.activity_data = (request.postDataJSON() as { activity_data: Record<string, unknown> }).activity_data;
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
        const data = rows
          .filter((r) => !status || r.status === status)
          .map((r) => ({
            ...r,
            unit: "tCO2e",
            activity_data_unit: "litre",
            date_of_reporting: "2025-09-30",
            created_at: `2025-10-0${r.pk_id}T08:00:00Z`,
            updated_at: "2025-10-01T08:00:00Z",
            site: { site_id: 1, name: "Hidd" },
            created_by: { user_id: 4, name: "Omar Contributor" },
            emission_factor_snapshot: { emission_factor_id: 9, emission_category_name: "Diesel (average biofuel blend)", factor_value: 0.00268, denominator_unit: "litre", source: "DEFRA", year: 2024 },
          }));
        const count = (s: string) => rows.filter((r) => r.status === s).length;
        return json({ data, total: data.length, summary: { total_emission: 0, pending_count: count("pending"), approved_count: count("approved"), rejected_count: count("rejected") } });
      }
      return json({});
    },
  );
  return { rows, calls };
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
  await expect(drawer.getByTestId("calculation")).toContainText("per litre");
  await expect(drawer).toContainText("DEFRA");
  await expect(drawer).toContainText("No documents attached.");
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
  expect(calls.some((c) => c.path.includes("manager-edit"))).toBe(false);
  await page.getByLabel("Reason for the change").fill("Meter read corrected");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  expect(calls.find((c) => c.path === "/user/emissions/manager-edit/1")?.body).toMatchObject({
    activity_data: { fuel_type: "1", quantity: "150" },
    activity_data_unit: "litre",
    reason: "Meter read corrected",
  });
});

test("rejecting a batch with approved rows needs an explicit tick", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/data/approvals");
  await page.getByRole("tab", { name: /Upload batches/ }).click();
  await expect(page).toHaveURL(/view=batches/);
  const table = page.getByRole("table", { name: "Upload batches" });
  await expect(table).toContainText("30 pending · 10 approved");
  await expect(table).not.toContainText("Other company site");
  await table.getByRole("button", { name: "Reject…" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Reject 30 rows?" });
  await dialog.getByLabel("Reason").fill("Wrong month in the sheet");
  await expect(dialog.getByRole("button", { name: "Reject", exact: true })).toBeDisabled();
  await dialog.getByLabel(/Reject the 10 approved rows too/).check();
  await expect(page.getByRole("alertdialog", { name: "Reject 40 rows?" })).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByText("Batch rejected")).toBeVisible();
  expect(calls).toContainEqual({ method: "PUT", path: "/user/emissions/batch/b-1/reject", body: { comment: "Wrong month in the sheet" } });
});

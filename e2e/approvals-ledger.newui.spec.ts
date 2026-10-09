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
    activity_data: { fuel_type: "1", quantity: String(100 * n) },
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

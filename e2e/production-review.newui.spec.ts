import { type Page, expect, test } from "@playwright/test";

/**
 * P08 Production review smoke tests (VITE_NEW_UI=1 server). Production data
 * for three sites is answered locally from an in-memory list, and every
 * request is recorded so the tests can check what reached the server.
 */

type Status = "pending" | "approved" | "rejected";
type Row = {
  production_id: number;
  quantity: number;
  unit: string;
  start_date: string;
  end_date: string;
  status: Status;
  notes?: string;
  review_comment?: string;
  product: { product_id: number; name: string; unit: string };
  site: { site_id: number; name: string };
};

const company = { company_id: 1, name: "Midal Cables" };
const SITES = [
  { site_id: 1, name: "Hidd" },
  { site_id: 2, name: "Sitra" },
  { site_id: 3, name: "Askar" },
];
const user = { name: "Mia Manager", email: "mia@example.com", sites: SITES.map((s) => ({ ...s, company })) };
const product = (site: (typeof SITES)[number]) => ({ product_id: site.site_id * 10, name: "Wire rod", unit: "t" });

function makeRows(): Row[] {
  const [hidd, sitra, askar] = SITES;
  return [
    { production_id: 1, quantity: 4200, unit: "t", start_date: "2025-09-01", end_date: "2025-09-30", status: "pending", product: product(hidd), site: hidd },
    // Overlaps record 1: same product, same site.
    { production_id: 2, quantity: 1000, unit: "t", start_date: "2025-09-01", end_date: "2025-09-15", status: "pending", product: product(hidd), site: hidd },
    { production_id: 3, quantity: 3000, unit: "t", start_date: "2025-09-01", end_date: "2025-09-30", status: "approved", product: product(sitra), site: sitra },
    { production_id: 4, quantity: 2500, unit: "t", start_date: "2025-08-01", end_date: "2025-08-31", status: "pending", product: product(askar), site: askar },
  ];
}

async function signIn(page: Page, opts: { products?: boolean } = {}) {
  const rows = opts.products === false ? [] : makeRows();
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const listSites: Array<string | null> = [];
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
      if (path.endsWith("/user/audit-logs")) return json([]);
      const products = /\/products\/site\/(\d+)$/.exec(path);
      if (products) {
        const site = SITES.find((s) => s.site_id === Number(products[1]))!;
        return json(opts.products === false ? [] : [{ ...product(site), site }]);
      }
      if (/\/user\/emission-intensity\/site\/\d+$/.test(path)) {
        // Approved for Hidd in Sep: 92,400 t CO2e over 42,000 t → 2.20.
        return json({ totalEmissions: 92400, productionByUnit: [{ unit: "t", totalProduction: 42000, emissionIntensity: 2.2 }], monthlyData: [], dateRange: {} });
      }

      if (path.endsWith("/user/production-data/bulk-approve")) {
        for (const id of (request.postDataJSON() as { ids: number[] }).ids) rows.find((r) => r.production_id === id)!.status = "approved";
        return json({ message: "ok" });
      }
      const edit = /\/user\/production-data\/manager-edit\/(\d+)$/.exec(path);
      if (edit) {
        const row = rows.find((r) => r.production_id === Number(edit[1]))!;
        Object.assign(row, request.postDataJSON());
        return json({ productionData: row });
      }
      const approve = /\/user\/production-data\/(\d+)\/approve$/.exec(path);
      if (approve) {
        rows.find((r) => r.production_id === Number(approve[1]))!.status = "approved";
        return json({ message: "ok" });
      }
      const reject = /\/user\/production-data\/(\d+)\/reject$/.exec(path);
      if (reject) {
        const row = rows.find((r) => r.production_id === Number(reject[1]))!;
        row.status = "rejected";
        row.review_comment = (request.postDataJSON() as { comment: string }).comment;
        return json({ message: "ok" });
      }
      if (path.endsWith("/user/production-data/manager")) {
        const siteId = url.searchParams.get("siteId");
        listSites.push(siteId);
        // Like the real endpoint, no siteId means every company's records.
        const data = rows
          .filter((r) => !siteId || r.site.site_id === Number(siteId))
          .map((r) => ({
            ...r,
            created_by: { user_id: 4, name: "Omar Contributor" },
            created_at: `2025-10-0${r.production_id}T08:00:00Z`,
            updated_at: "2025-10-01T08:00:00Z",
          }));
        return json(data);
      }
      return json({});
    },
  );
  return { rows, calls, listSites };
}

const recordsTable = (page: Page) => page.getByRole("table", { name: "Production records" });

test("a manager reviews production across three sites with the keyboard, undo and bulk", async ({ page }) => {
  const { calls, listSites } = await signIn(page);
  await page.goto("/data/production?status=pending");
  const table = recordsTable(page);
  // Header row + three pending records, from every site.
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table).toContainText("Askar");
  await expect(table).toContainText("Sep 1 – Sep 30, 2025");
  await expect(page.getByTestId("record-count")).toContainText("3 records · 3 pending");
  // The two Hidd records overlap.
  await expect(table.getByText("Overlaps Sep 1–15")).toBeVisible();
  await expect(table.getByText("Overlaps Sep 1–30")).toBeVisible();
  // Never an unscoped list request.
  expect(listSites.length).toBeGreaterThanOrEqual(3);
  expect(listSites).not.toContain(null);

  // J focuses the first row (newest: Askar), A approves it; Undo puts it back with nothing sent.
  await page.locator("body").press("j");
  await expect(table.locator("tbody tr").first()).toBeFocused();
  await page.keyboard.press("a");
  await expect(page.getByText("Record approved")).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(table.getByRole("row")).toHaveCount(4);
  expect(calls.filter((c) => c.path.endsWith("/approve"))).toHaveLength(0);

  // R asks for a reason; a suggested reason is enough.
  await table.locator("tbody tr").first().focus();
  await page.keyboard.press("r");
  const dialog = page.getByRole("alertdialog", { name: "Reject this record?" });
  await dialog.getByRole("button", { name: "Duplicate" }).click();
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(dialog).toBeHidden();
  expect(calls).toContainEqual({ method: "PUT", path: "/user/production-data/4/reject", body: { comment: "Duplicate" } });
  await expect(table.getByRole("row")).toHaveCount(3);

  // Select all on the full list (approved and rejected included): bulk approve sends pending rows only.
  await page.goto("/data/production");
  await expect(table.getByRole("row")).toHaveCount(5);
  await table.getByRole("checkbox", { name: /select all/i }).check();
  await page.getByRole("button", { name: "Approve 2 pending" }).click();
  await expect(page.getByText("2 records approved")).toBeVisible();
  const bulk = calls.find((c) => c.path.endsWith("/bulk-approve"));
  expect((bulk?.body as { ids: number[] }).ids.sort()).toEqual([1, 2]);
});

test("the drawer shows the intensity impact and edits need a reason", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/data/production?site=1");
  const table = recordsTable(page);
  await expect(table.getByRole("row")).toHaveCount(3);
  await table.locator("tbody tr").nth(1).click();
  const drawer = page.getByRole("dialog", { name: "Wire rod" });
  await expect(drawer.getByTestId("drawer-quantity")).toContainText("4,200.00");
  await expect(drawer.getByTestId("intensity-impact")).toHaveText("Approving adds 4,200 t to Sep 2025; intensity 2.20 → 2.00 tCO₂e/t.");
  await expect(drawer).toContainText("Another record of this product on this site covers Sep 1–15");

  await drawer.getByRole("button", { name: "Edit" }).click();
  const form = page.getByRole("dialog", { name: "Edit · Wire rod" });
  await form.getByLabel("Quantity").fill("4100");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(form.getByText(/Say why this changes/)).toBeVisible();
  expect(calls.filter((c) => c.path.includes("manager-edit"))).toHaveLength(0);
  await form.getByLabel("Reason for the change").fill("Weighbridge correction");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  expect(calls).toContainEqual({
    method: "PUT",
    path: "/user/production-data/manager-edit/1",
    body: { quantity: 4100, unit: "t", start_date: "2025-09-01", end_date: "2025-09-30", notes: "", reason: "Weighbridge correction" },
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("empty filters and sites without products say so", async ({ page }) => {
  await signIn(page);
  await page.goto("/data/production?site=3&status=approved");
  await expect(page.getByText("No production data for Askar, Approved")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(recordsTable(page).getByRole("row")).toHaveCount(5);

  // A site with no products has nothing to review; the page says who can add them.
  await signIn(page, { products: false });
  await page.goto("/data/production?site=3");
  await expect(page.getByText("No products are set up for Askar")).toBeVisible();
  await expect(page.getByText(/added by your Superadmin/)).toBeVisible();
});

test("the old address redirects", async ({ page }) => {
  await signIn(page);
  await page.goto("/manage-production-data");
  await expect(page).toHaveURL(/\/data\/production/);
  await expect(page.getByRole("heading", { name: "Production data" })).toBeVisible();
});

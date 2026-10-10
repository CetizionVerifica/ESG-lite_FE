import { type Page, expect, test } from "@playwright/test";

/**
 * P05 Production smoke tests (VITE_NEW_UI=1 server). A contributor on one
 * site; production records are answered from an in-memory list and every
 * write is recorded so the tests can check what reached the server.
 */

type Status = "pending" | "approved" | "rejected";
type Row = {
  production_id: number;
  quantity: number;
  unit: string;
  start_date: string;
  end_date: string;
  status: Status;
  notes?: string | null;
  review_comment?: string | null;
  product: { product_id: number; name: string; unit: string };
  site: { site_id: number; name: string };
  created_at: string;
  updated_at: string;
};

const company = { company_id: 1, name: "Midal Cables" };
const HIDD = { site_id: 1, name: "Hidd" };
const user = { name: "Omar Contributor", email: "omar@example.com", sites: [{ ...HIDD, company }] };
const ROD = { product_id: 10, name: "Wire rod", unit: "t" };
const CABLE = { product_id: 11, name: "Cable", unit: "km" };

function makeRows(): Row[] {
  const base = { site: HIDD, created_at: "2025-10-02T08:00:00Z", updated_at: "2025-10-02T08:00:00Z" };
  return [
    { ...base, production_id: 1, quantity: 4200, unit: "t", start_date: "2025-09-01", end_date: "2025-09-30", status: "pending", product: ROD, notes: "Shift A+B" },
    { ...base, production_id: 2, quantity: 3900, unit: "t", start_date: "2025-08-01", end_date: "2025-08-31", status: "approved", product: ROD },
    { ...base, production_id: 3, quantity: 120, unit: "m", start_date: "2025-08-01", end_date: "2025-08-31", status: "rejected", product: CABLE, review_comment: "Cable is logged in km" },
  ];
}

async function signIn(page: Page, opts: { products?: boolean; bulkErrors?: { row: number; message: string }[] } = {}) {
  const rows = makeRows();
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  let nextId = 100;
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "User");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
      const body = method === "GET" || method === "DELETE" ? null : request.postDataJSON();
      if (method !== "GET") calls.push({ method, path, body });

      if (path.endsWith("/auth/me")) return json({ role: "User", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/user/audit-logs")) return json([]);
      if (path.endsWith("/user/products/site/1")) return json(opts.products === false ? [] : [ROD, CABLE].map((p) => ({ ...p, site: HIDD })));
      if (path.endsWith("/user/production-data/site/1") && method === "GET") return json(rows);
      if (path.endsWith("/user/production-data/bulk-create")) {
        const entries = (body as { entries: unknown[] }).entries;
        const errors = opts.bulkErrors ?? [];
        return json({ message: "ok", created: entries.length - errors.length, errors }, 201);
      }
      if (path.endsWith("/user/production-data") && method === "POST") {
        const b = body as Row & { product_id: number };
        const row: Row = {
          ...rows[0],
          ...b,
          production_id: nextId++,
          status: "pending",
          product: [ROD, CABLE].find((p) => p.product_id === b.product_id)!,
          site: HIDD,
        };
        rows.push(row);
        return json({ productionData: row }, 201);
      }
      const one = /\/user\/production-data\/(\d+)$/.exec(path);
      if (one && method === "PUT") {
        const row = rows.find((r) => r.production_id === Number(one[1]))!;
        Object.assign(row, body, row.status === "rejected" ? { status: "pending", review_comment: null } : {});
        return json({ productionData: row });
      }
      if (one && method === "DELETE") {
        rows.splice(rows.findIndex((r) => r.production_id === Number(one[1])), 1);
        return json({ message: "deleted" });
      }
      return json({});
    },
  );
  return { rows, calls };
}

const recordsTable = (page: Page) => page.getByRole("table", { name: "Production records" });

test("old path redirects; cards show the month and a to-do card adds production with an overlap warning", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/production-data?period=2025-09");
  await expect(page).toHaveURL(/\/production\?period=2025-09/);

  const cards = page.getByTestId("product-cards");
  await expect(page.getByRole("heading", { name: "Products · Sep 2025" })).toBeVisible();
  await expect(cards.getByRole("button", { name: /Wire rod: pending for Sep 2025/ })).toContainText("Last: 4,200.00 t · Sep 2025");
  // The September filter shows only the September record; no internal ID column.
  const table = recordsTable(page);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByRole("columnheader", { name: "ID" })).toHaveCount(0);

  // Cable has nothing for September: its card opens the add drawer for Cable and September.
  await cards.getByRole("button", { name: /Cable: to do for Sep 2025/ }).click();
  const drawer = page.getByRole("dialog", { name: "Add production" });
  await expect(drawer.getByLabel("Product")).toHaveValue("11");
  await drawer.getByRole("button", { name: "Add production" }).click();
  await expect(drawer.getByText("Enter a quantity above 0")).toBeVisible();
  expect(calls).toHaveLength(0);

  await drawer.getByLabel("Quantity").fill("250");
  await drawer.getByLabel("Notes").fill("Line 2");
  await drawer.getByRole("button", { name: "Add production" }).click();
  await expect(page.getByText("Production added")).toBeVisible();
  expect(calls).toContainEqual({
    method: "POST",
    path: "/user/production-data",
    body: { product_id: 11, site_id: 1, quantity: 250, unit: "km", start_date: "2025-09-01", end_date: "2025-09-30", notes: "Line 2" },
  });
  await expect(cards.getByRole("button", { name: /Cable: pending for Sep 2025/ })).toBeVisible();

  // Adding Wire rod for September again warns about the pending record (and still allows saving).
  await page.getByRole("button", { name: "Add production" }).first().click();
  const again = page.getByRole("dialog", { name: "Add production" });
  await again.getByLabel("Product").selectOption("10");
  await expect(again.getByText("This period overlaps another record")).toBeVisible();
  await expect(again).toContainText("Sep 1–30 (pending)");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("a rejected record is fixed and resubmitted; a pending one is deleted after confirming", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/production?status=rejected");
  const table = recordsTable(page);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Cable is logged in km");

  await table.getByRole("button", { name: /Actions for Cable/ }).click();
  await page.getByRole("menuitem", { name: "Fix and resubmit" }).click();
  const form = page.getByRole("dialog", { name: "Fix · Cable" });
  await expect(form).toContainText("Cable is logged in km");
  await form.getByLabel("Quantity").fill("0.12");
  await form.getByRole("combobox", { name: /unit/i }).selectOption("km");
  await form.getByRole("button", { name: "Resubmit" }).click();
  await expect(page.getByText("Resubmitted for approval")).toBeVisible();
  expect(calls).toContainEqual({
    method: "PUT",
    path: "/user/production-data/3",
    body: { quantity: 0.12, unit: "km", start_date: "2025-08-01", end_date: "2025-08-31", notes: "" },
  });
  await page.keyboard.press("Escape");

  // Approved records offer no edit or delete.
  await page.goto("/production?status=approved");
  await table.getByRole("button", { name: /Actions for Wire rod/ }).click();
  await expect(page.getByRole("menuitem", { name: "Delete…" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/production?status=pending&period=2025-09");
  await table.locator("tbody tr").first().click();
  const drawer = page.getByRole("dialog", { name: "Wire rod" });
  await drawer.getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this production record?" });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(0);
  await drawer.getByRole("button", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Delete record" }).click();
  await expect(page.getByText("Record deleted")).toBeVisible();
  expect(calls).toContainEqual({ method: "DELETE", path: "/user/production-data/1", body: null });
});

test("an uploaded sheet is reviewed, fixed and uploaded, with failures shown by row", async ({ page }) => {
  const { calls } = await signIn(page, { bulkErrors: [{ row: 2, message: "Product not found or does not belong to this site" }] });
  await page.goto("/production");
  await page.getByRole("button", { name: "Upload sheet" }).click();
  const drawer = page.getByRole("dialog", { name: "Upload sheet" });
  await expect(drawer.getByRole("button", { name: "Download template" })).toBeVisible();

  const csv = ["product,quantity,unit,date,notes", "Wire rod,4300,t,October 2025,", "cable,12,km,10-2025,", "Wire rod,,t,someday,", "Copper,5,t,10-2025,"].join("\n");
  await drawer.locator('input[type="file"]').setInputFiles({ name: "october.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });

  const counts = drawer.getByTestId("upload-counts");
  await expect(counts).toContainText("Total 4");
  await expect(counts).toContainText("Valid 2");
  await expect(counts).toContainText("Needs fix 1");
  await expect(counts).toContainText("Excluded 1");
  await expect(drawer.getByTestId("excluded-rows")).toContainText("Copper isn't a product of Hidd");
  await expect(drawer.getByTestId("review-row-4")).toContainText('Couldn\'t read "someday"');

  // Fix row 4 in the grid.
  await drawer.getByLabel("Row 4 quantity").fill("10");
  await drawer.getByLabel("Row 4 start").fill("2025-10-01");
  await drawer.getByLabel("Row 4 end").fill("2025-10-31");
  await expect(counts).toContainText("Valid 3");
  await drawer.getByRole("button", { name: "Upload 3 rows" }).click();

  const result = drawer.getByTestId("upload-result");
  await expect(result).toContainText("2 records added");
  await expect(result).toContainText("Row 3: Product not found or does not belong to this site");
  await expect(result).toContainText("Not uploaded: 1 excluded");
  const bulk = calls.find((c) => c.path.endsWith("/bulk-create"))!.body as { entries: Array<Record<string, unknown>> };
  expect(bulk.entries).toEqual([
    { product_id: 10, site_id: 1, quantity: 4300, unit: "t", start_date: "2025-10-01", end_date: "2025-10-31" },
    { product_id: 11, site_id: 1, quantity: 12, unit: "km", start_date: "2025-10-01", end_date: "2025-10-31" },
    { product_id: 10, site_id: 1, quantity: 10, unit: "t", start_date: "2025-10-01", end_date: "2025-10-31" },
  ]);
  await drawer.getByRole("button", { name: "Upload another" }).click();
  await expect(drawer.locator('input[type="file"]')).toBeAttached();
});

test("a site without products says so and blocks adding", async ({ page }) => {
  await signIn(page, { products: false });
  await page.goto("/production");
  await expect(page.getByText("No products are set up for Hidd.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add production" })).toBeDisabled();
});

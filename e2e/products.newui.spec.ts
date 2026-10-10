import { type Page, expect, test } from "@playwright/test";

/**
 * P25 Products smoke tests (VITE_NEW_UI=1 server). The admin endpoints answer
 * from in-memory lists, and every write is recorded so the tests can check
 * what reached the server.
 */

type Site = { site_id: number; name: string; company: { company_id: number; name: string } };
type ProductRec = {
  product_id: number;
  name: string;
  description: string | null;
  unit: string;
  site: Site;
  production_count: number;
  last_period_end: string | null;
};

const COMPANIES = [
  { company_id: 1, name: "Midal Cables" },
  { company_id: 2, name: "Gulf Foods" },
];
const SITES: Site[] = [
  { site_id: 1, name: "Hidd", company: COMPANIES[0] },
  { site_id: 2, name: "Askar", company: COMPANIES[0] },
  { site_id: 3, name: "Pune", company: COMPANIES[1] },
];
const UNITS = [{ unit_id: 1, unit_name: "kWh", site: { site_id: 1 }, category: { category_id: 1 } }];

function makeProducts(): ProductRec[] {
  return [
    { product_id: 1, name: "Aluminium rod", description: "9.5 mm rod", unit: "tonnes", site: SITES[0], production_count: 3, last_period_end: "2026-02-28" },
    { product_id: 2, name: "Biscuits", description: null, unit: "kg", site: SITES[2], production_count: 0, last_period_end: null },
  ];
}

const PRODUCTION = {
  total: 3,
  records: [
    {
      production_id: 3,
      quantity: "120.0000",
      unit: "tonnes",
      start_date: "2026-02-01",
      end_date: "2026-02-28",
      status: "pending",
      site: { site_id: 1, name: "Hidd" },
    },
    {
      production_id: 2,
      quantity: "100.5000",
      unit: "tonnes",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      status: "approved",
      site: { site_id: 1, name: "Hidd" },
    },
    {
      production_id: 1,
      quantity: "90.0000",
      unit: "tonnes",
      start_date: "2025-12-10",
      end_date: "2025-12-20",
      status: "rejected",
      site: { site_id: 1, name: "Hidd" },
    },
  ],
};

async function signIn(page: Page) {
  let products = makeProducts();
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const user = { name: "Sam Staff", email: "sam@example.com" };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Superadmin");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (method !== "GET") calls.push({ method, path, body: request.postDataJSON() });

      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/companies")) return json(COMPANIES);
      if (path.endsWith("/admin/sites")) return json(SITES);
      if (path.endsWith("/admin/units")) return json(UNITS);
      if (/\/admin\/products\/1\/production$/.test(path)) return json(PRODUCTION);

      const one = /\/admin\/products\/(\d+)$/.exec(path);
      const body = request.postDataJSON() as Record<string, never> | null;
      if (one && method === "PUT") {
        const id = Number(one[1]);
        const before = products.find((p) => p.product_id === id)!;
        const site = body!.site_id ? SITES.find((s) => s.site_id === body!.site_id)! : before.site;
        const moved = site.site_id !== before.site.site_id ? before.production_count : 0;
        products = products.map((p) => (p.product_id === id ? { ...p, ...(body as object), site } : p));
        return json({ message: "Product updated successfully", product: products.find((p) => p.product_id === id), moved_production_count: moved });
      }
      if (one && method === "DELETE") {
        products = products.filter((p) => p.product_id !== Number(one[1]));
        return json({ message: "Product deleted successfully" });
      }
      if (path.endsWith("/admin/products") && method === "POST") {
        const product: ProductRec = {
          product_id: 3,
          name: body!.name,
          description: body!.description || null,
          unit: body!.unit,
          site: SITES.find((s) => s.site_id === body!.site_id)!,
          production_count: 0,
          last_period_end: null,
        };
        products = [...products, product];
        return json({ message: "Product created successfully", product }, 201);
      }
      if (path.endsWith("/admin/products")) return json(products);
      return json({});
    },
  );
  return { calls };
}

const productsTable = (page: Page) => page.getByRole("table", { name: "Products" });

async function pick(page: Page, label: string, option: string) {
  const box = page.getByRole("combobox", { name: label });
  await box.click();
  await box.fill(option.slice(0, 3));
  await page.getByRole("option", { name: option }).click();
}

test("a superadmin filters products and adds one, which needs a site", async ({ page }) => {
  const { calls } = await signIn(page);
  // The PCF path sends a superadmin here.
  await page.goto("/products");
  await expect(page).toHaveURL(/\/setup\/products/);
  const table = productsTable(page);
  await expect(table.getByRole("row")).toHaveCount(3);
  const rod = table.getByRole("row", { name: /Aluminium rod/ });
  await expect(rod).toContainText("Midal Cables");
  await expect(rod).toContainText("Feb 2026");
  await expect(table.getByRole("row", { name: /Biscuits/ })).toContainText("None yet");

  // Client filter narrows the list and the Site filter's options.
  await page.getByRole("button", { name: /Client:/ }).click();
  await page.getByRole("radio", { name: "Gulf Foods" }).click();
  await expect(page).toHaveURL(/client=2/);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(page.getByTestId("setup-summary")).toHaveText("1 product of 2");
  await page.getByRole("button", { name: /Clear all/ }).click();
  await expect(table.getByRole("row")).toHaveCount(3);

  // Add product: site is required (it used to fail silently).
  await page.getByRole("button", { name: "Add product" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Add product" });
  await drawer.getByLabel("Product name").fill("Copper wire");
  await drawer.getByLabel("Default unit").fill("tonnes");
  await drawer.getByRole("button", { name: "Add product" }).click();
  await expect(drawer.getByText("Choose the site that makes this product.")).toBeVisible();
  expect(calls).toHaveLength(0);
  await pick(page, "Site", "Askar · Midal Cables");
  await drawer.getByRole("button", { name: "Add product" }).click();

  await expect(page.getByText('Product "Copper wire" added')).toBeVisible();
  expect(calls).toEqual([
    { method: "POST", path: expect.stringMatching(/\/admin\/products$/), body: { name: "Copper wire", site_id: 2, unit: "tonnes", description: "" } },
  ]);
  await expect(table.getByRole("row", { name: /Copper wire/ })).toContainText("Askar");
});

test("a superadmin sees recent production, moves a product with a warning and deletes it", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/setup/products");
  await page.getByRole("button", { name: "Edit Aluminium rod" }).click();
  await expect(page).toHaveURL(/open=1/);
  // A shared link opens the same drawer.
  await page.reload();
  const drawer = page.getByRole("dialog", { name: "Aluminium rod" });

  await drawer.getByRole("tab", { name: /Production/ }).click();
  await expect(drawer.getByText("3 production records, newest period first.", { exact: false })).toBeVisible();
  await expect(drawer.getByText("Feb 2026")).toBeVisible();
  await expect(drawer.getByText("10 Dec 2025 – 20 Dec 2025")).toBeVisible();
  await expect(drawer.getByText("100.50")).toBeVisible();

  await drawer.getByRole("tab", { name: /Details/ }).click();
  await pick(page, "Site", "Askar · Midal Cables");
  await expect(drawer.getByText("Its 3 production records move with it.", { exact: false })).toBeVisible();
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText('Product "Aluminium rod" saved')).toBeVisible();
  await expect(page.getByText("3 production records moved with it.")).toBeVisible();
  // Only the changed field is sent.
  expect(calls.at(-1)).toEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/products\/1$/), body: { site_id: 2 } });

  await page.getByRole("row", { name: /Aluminium rod/ }).click();
  await page.getByRole("dialog", { name: "Aluminium rod" }).getByRole("button", { name: "Delete product" }).click();
  const confirm = page.getByRole("alertdialog", { name: 'Delete product "Aluminium rod"?' });
  await expect(confirm.getByTestId("delete-cascades")).toContainText("3 production records, the latest for Feb 2026");
  const del = confirm.getByRole("button", { name: "Delete product" });
  await expect(del).toBeDisabled();
  await confirm.getByLabel(/Type Aluminium rod to confirm/).fill("aluminium rod");
  await del.click();
  await expect(page.getByText('Product "Aluminium rod" deleted')).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: expect.stringMatching(/\/admin\/products\/1$/) });
  await expect(productsTable(page).getByRole("row")).toHaveCount(2);
});

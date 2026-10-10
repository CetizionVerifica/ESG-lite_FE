import { type Page, expect, test } from "@playwright/test";

/**
 * P24 Capture setup smoke tests (VITE_NEW_UI=1 server): the columns library.
 * The forms list joins with the form builder in part 2. Column and form endpoints are
 * answered locally and writes are recorded.
 */

const midal = { company_id: 1, name: "Midal Cables" };
const acme = { company_id: 2, name: "Acme" };
const fuel = { category_id: 10, category_name: "Stationary combustion", scope: "Scope 1" };
const power = { category_id: 20, category_name: "Purchased electricity", scope: "Scope 2" };
const SITES = [
  { site_id: 1, name: "Hidd", company: midal, categories: [fuel, power] },
  { site_id: 2, name: "Sitra", company: midal, categories: [fuel] },
  { site_id: 3, name: "Dallas", company: acme, categories: [power] },
];
const amount = { pk_id: 100, column_name: "Amount", column_type: "number", dropdown_options: null };
const fuelType = { pk_id: 101, column_name: "Fuel type", column_type: "select", dropdown_options: [{ id: "diesel", label: "Diesel" }, { id: "lpg", label: "LPG" }] };
const notes = { pk_id: 102, column_name: "Notes", column_type: "text", dropdown_options: null };

type Call = { method: string; path: string; body: unknown };

async function signIn(page: Page) {
  const calls: Call[] = [];
  const user = { name: "Sam Staff", email: "sam@example.com" };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Superadmin");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  let columns = [amount, fuelType, notes];
  const configs = [
    { pk_id: 7, config_name: "Hidd fuel", site: { site_id: 1, name: "Hidd" }, category: fuel, columns: [amount, fuelType], emission_category_mapping: { diesel: "Diesel" }, extra_fields: [], calculation: null },
    { pk_id: 9, config_name: "Dallas power", site: { site_id: 3, name: "Dallas" }, category: power, columns: [amount], emission_category_mapping: {}, extra_fields: [], calculation: { mode: "per_unit" } },
  ];
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const method = request.method();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (method !== "GET") calls.push({ method, path, body: request.postDataJSON() });
      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/admin/companies")) return json({ companies: [midal, acme] });
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/sites")) return json(SITES);
      if (path.endsWith("/admin/column-configs") && method === "POST") {
        const body = request.postDataJSON();
        return json({ message: "created", columnConfig: { pk_id: 50, ...body } }, 201);
      }
      if (path.endsWith("/admin/column-configs")) return json(configs);
      if (path.endsWith("/admin/columns") && method === "POST") {
        const body = request.postDataJSON();
        columns = [...columns, { pk_id: 103, ...body }];
        return json(columns.at(-1), 201);
      }
      if (path.endsWith("/admin/columns")) return json(columns);
      const col = path.match(/\/admin\/columns\/(\d+)$/);
      if (col && method === "PUT") {
        columns = columns.map((c) => (c.pk_id === Number(col[1]) ? { ...c, ...request.postDataJSON() } : c));
        return json({ message: "updated" });
      }
      if (col && method === "DELETE") {
        if (Number(col[1]) === 100) return json({ message: "Cannot delete column that is associated with column configs", associatedConfigs: [{ pk_id: 7, config_name: "Hidd fuel" }] }, 400);
        columns = columns.filter((c) => c.pk_id !== Number(col[1]));
        return json({ message: "deleted" });
      }
      return json({});
    },
  );
  return { calls };
}

test("columns: add a Select column, change a type, and blocked delete", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/capture/columns");
  const table = page.getByRole("table", { name: "Columns" });
  await expect(table.getByRole("row", { name: /Amount/ })).toContainText("2 forms");

  await page.getByRole("button", { name: "Add column" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Add column" });
  await drawer.getByLabel("Column name").fill("Vehicle");
  await drawer.getByLabel("Type").selectOption("select");
  await drawer.getByRole("button", { name: "Add choice" }).click();
  await drawer.getByLabel("Choice 1 label").fill("Small car");
  await drawer.getByRole("button", { name: "Add choice" }).click();
  await drawer.getByLabel("Choice 2 label").fill("Van");
  await drawer.getByRole("button", { name: "Add column" }).click();
  await expect(page.getByText('Column "Vehicle" added')).toBeVisible();
  expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/admin/columns"))?.body).toEqual({
    column_name: "Vehicle",
    column_type: "select",
    dropdown_options: [
      { id: "small_car", label: "Small car" },
      { id: "van", label: "Van" },
    ],
  });

  await table.getByText("Fuel type").click();
  const edit = page.getByRole("dialog", { name: "Fuel type" });
  // Saved choices: the stored value is read-only and removing one asks first.
  await edit.getByRole("button", { name: "Show stored values" }).click();
  await expect(edit.getByLabel("Choice 2 stored value")).toHaveAttribute("readonly", "");
  await edit.getByRole("button", { name: "Remove choice LPG" }).click();
  await edit.getByRole("button", { name: "Save column" }).click();
  const removeConfirm = page.getByRole("alertdialog", { name: "Remove 1 saved choice?" });
  await expect(removeConfirm).toContainText('"LPG" will no longer be offered.');
  await expect(removeConfirm).toContainText("Hidd fuel");
  await removeConfirm.getByRole("button", { name: "Cancel" }).click();
  expect(calls.some((c) => c.method === "PUT")).toBe(false);
  await edit.getByLabel("Type").selectOption("text");
  await expect(edit.getByText("Saving removes 2 choices")).toBeVisible();
  await edit.getByRole("button", { name: "Save column" }).click();
  await page.getByRole("alertdialog", { name: "Remove 2 choices?" }).getByRole("button", { name: "Change type" }).click();
  await expect(page.getByText('Column "Fuel type" saved')).toBeVisible();
  expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ column_name: "Fuel type", column_type: "text", dropdown_options: null });

  // Used by forms: a type change names them first, and delete is blocked with the list.
  await table.getByText("Amount").click();
  const amountDrawer = page.getByRole("dialog", { name: "Amount" });
  await amountDrawer.getByLabel("Type").selectOption("date");
  await amountDrawer.getByRole("button", { name: "Save column" }).click();
  const typeConfirm = page.getByRole("alertdialog", { name: 'Make "Amount" a Date column?' });
  await expect(typeConfirm).toContainText("Hidd fuel, Dallas power");
  await typeConfirm.getByRole("button", { name: "Cancel" }).click();
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  await amountDrawer.getByLabel("Type").selectOption("number");
  await amountDrawer.getByRole("button", { name: "Delete column" }).click();
  const blocked = page.getByRole("dialog", { name: '"Amount" is still in use' });
  await expect(blocked.getByRole("link", { name: "Hidd fuel" })).toHaveAttribute("href", "/capture/forms");
  await expect(blocked.getByRole("link", { name: "Dallas power" })).toBeVisible();
  await blocked.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.keyboard.press("Escape");

  // Unused: confirm, then delete.
  await table.getByText("Notes").click();
  await page.getByRole("dialog", { name: "Notes" }).getByRole("button", { name: "Delete column" }).click();
  await page.getByRole("alertdialog", { name: 'Delete "Notes"?' }).getByRole("button", { name: "Delete column" }).click();
  await expect(page.getByText('Column "Notes" deleted')).toBeVisible();
  expect(calls.some((c) => c.method === "DELETE" && c.path.endsWith("/admin/columns/102"))).toBe(true);
});

test("old capture routes redirect", async ({ page }) => {
  await signIn(page);
  await page.goto("/column-config");
  await expect(page).toHaveURL(/\/capture\/forms$/);
  await page.goto("/manage-columns");
  await expect(page).toHaveURL(/\/capture\/columns$/);
});

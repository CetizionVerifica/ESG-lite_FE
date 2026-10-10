import { type Page, expect, test } from "@playwright/test";

/**
 * P24 Capture setup smoke tests (VITE_NEW_UI=1 server): the forms list with
 * its coverage matrix, auto-generate, the form builder with its Test tab, and
 * the columns library. Column and form endpoints are
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

test("forms: coverage matrix starts a form for a missing site and category", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/capture/forms");
  await expect(page.getByRole("heading", { name: "Data-entry forms", level: 1 })).toBeVisible();
  const table = page.getByRole("table", { name: "Data-entry forms" });
  await expect(table.getByText("Hidd fuel")).toBeVisible();
  await expect(table.getByText("Dallas power")).toBeVisible();
  // Two clients in view: the matrix asks for one.
  await expect(page.getByText("Pick a client to see which of its site and category pairs have a form.")).toBeVisible();

  await page.goto("/capture/forms?client=1");
  const matrix = page.getByTestId("coverage-matrix");
  await expect(matrix).toBeVisible();
  await expect(matrix.getByText("1 configured")).toBeVisible();
  await expect(matrix.getByText("2 missing")).toBeVisible();
  await expect(table.getByText("Dallas power")).toHaveCount(0);

  await matrix.getByRole("button", { name: "Hidd, Purchased electricity: missing. Create form" }).click();
  const dialog = page.getByRole("dialog", { name: "New form" });
  await expect(dialog.getByLabel("Form name")).toHaveValue("Hidd · Purchased electricity");
  await dialog.getByRole("button", { name: "Create form" }).click();
  await expect(page.getByText('Form "Hidd · Purchased electricity" created')).toBeVisible();
  expect(calls.find((c) => c.path.endsWith("/admin/column-configs"))?.body).toEqual({ config_name: "Hidd · Purchased electricity", site_id: 1, category_id: 20 });

  // A configured cell opens its form.
  await matrix.getByRole("button", { name: "Hidd, Stationary combustion: configured. Open form" }).click();
  await expect(page).toHaveURL(/\/capture\/forms\/7$/);
});

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
  await expect(blocked.getByRole("link", { name: "Hidd fuel" })).toHaveAttribute("href", "/capture/forms/7");
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

const transport = {
  pk_id: 7,
  config_name: "Hidd transport",
  site: { site_id: 1, name: "Hidd" },
  category: { category_id: 30, category_name: "Upstream transport" },
  columns: [
    { pk_id: 1, column_name: "mode", column_type: "select" },
    { pk_id: 2, column_name: "vehicle", column_type: "select" },
    { pk_id: 4, column_name: "distance", column_type: "number" },
  ],
  column_options: { "1": [{ id: "road", label: "Road" }, { id: "boat", label: "Boat" }] },
  column_dependencies: { vehicle: "mode" },
  dependent_options: { vehicle: { Road: [{ id: "van", label: "Van" }, { id: "hgv", label: "HGV" }], Boat: [{ id: "ferry", label: "Ferry" }] } },
  emission_category_mapping: { "Road|Van": "Van - Diesel", "Boat|Ferry": "Ferry crossing" },
  extra_fields: [],
  calculation: null,
};

async function routeTransport(page: Page, calls: Call[]) {
  await page.route(/\/admin\/column-configs\/7$/, (route) =>
    route.request().method() === "PUT"
      ? (calls.push({ method: "PUT", path: "/admin/column-configs/7", body: route.request().postDataJSON() }), route.fulfill({ json: { message: "updated", columnConfig: { ...transport, ...route.request().postDataJSON() } } }))
      : route.fulfill({ json: transport }),
  );
  await page.route(/\/admin\/emission-factors\/category-names/, (route) => route.fulfill({ json: ["Van - Diesel", "HGV - Diesel"] }));
}

test("form builder: Test tab calculates with the real factor", async ({ page }) => {
  const { calls } = await signIn(page);
  await routeTransport(page, calls);
  await page.route(/\/user\/emission-factors\/site\/1\/category\/30/, (route) =>
    route.fulfill({
      json: [
        { emission_factor_id: 1, emission_category_name: "Van - Diesel", factor_value: 0.25, denominator_unit: "km", year: 2025 },
        { emission_factor_id: 2, emission_category_name: "Van - Diesel", factor_value: 0.3, denominator_unit: "km", year: 2024 },
      ],
    }),
  );
  await page.route(/\/user\/units\/site\/1\/category\/30/, (route) => route.fulfill({ json: [{ unit_name: "km" }, { unit_name: "mile" }] }));

  await page.goto("/capture/forms/7");
  await page.getByRole("tab", { name: "Test" }).click();
  const panel = page.getByRole("tabpanel", { name: "Test" });
  const result = panel.getByTestId("test-result");
  await expect(result).toContainText("Select emission category");
  await panel.getByLabel("Mode").selectOption("road");
  await panel.getByLabel("Vehicle").selectOption("van");
  await panel.getByLabel("Distance").fill("10000");
  await panel.getByLabel("Unit", { exact: true }).selectOption("km");
  await expect(result).toContainText("2.50 tCO₂e");
  await expect(result).toContainText("Van - Diesel: 0.25 kgCO₂e per km (2025)");
  await panel.getByLabel("Factor year").selectOption("2024");
  await expect(result).toContainText("3.00 tCO₂e");
  // Nothing typed in the Test tab is saved or makes the form dirty.
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();
  expect(calls.some((c) => c.method === "PUT")).toBe(false);
});

test("forms: auto-generate builds a form from the factors", async ({ page }) => {
  const { calls } = await signIn(page);
  const select = (column_name: string, existing_id: number | null = null) => ({ existing_id, column_name, column_type: "select", is_new: existing_id === null });
  await page.route(/\/admin\/column-configs\/auto-generate\/preview/, (route) =>
    route.fulfill({
      json: {
        config_name: "Hidd - Stationary combustion",
        site_id: 1,
        category_id: 10,
        site_name: "Hidd",
        category_name: "Stationary combustion",
        existing_config_ids: [7],
        proposed_units: [
          { unit_name: "litre", already_exists: true },
          { unit_name: "kWh", already_exists: false },
        ],
        configs: [
          {
            denominator_unit: "litre",
            pattern: "TWO_DIM",
            columns: [],
            column_options: {},
            column_dependencies: {},
            dependent_options: {},
            emission_category_mapping: {},
            ef_names: ["Diesel - Generator", "Diesel - Boiler", "LPG - Boiler"],
            column_names_by_dim: {
              2: { activity_column_name: "quantity", columns: [select("fuel", 101), select("equipment"), { existing_id: 100, column_name: "quantity", column_type: "number", is_new: false }] },
            },
          },
          {
            denominator_unit: "kWh",
            pattern: "FLAT",
            columns: [],
            column_options: {},
            column_dependencies: {},
            dependent_options: {},
            emission_category_mapping: {},
            ef_names: ["Grid"],
            column_names_by_dim: {},
          },
        ],
      },
    }),
  );
  await page.route(/\/admin\/column-configs\/auto-generate\/confirm/, (route) => {
    calls.push({ method: "POST", path: "/admin/column-configs/auto-generate/confirm", body: route.request().postDataJSON() });
    return route.fulfill({ status: 201, json: { message: "created", columnConfig: { pk_id: 7 }, units_created: ["kWh", "tonne"] } });
  });

  // The deep link from Emission factors opens the drawer on the pair.
  await page.goto("/capture/forms?generate=1&site=1&category=10");
  const linked = page.getByRole("dialog", { name: "Auto-generate a form" });
  await expect(linked.getByText("3 factors")).toBeVisible();
  await linked.getByRole("button", { name: "Back" }).click();
  await expect(linked.getByLabel("Category")).toHaveValue(/.+/);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/capture\/forms\?site=1$/);

  await page.goto("/capture/forms");
  await page.getByRole("button", { name: "Auto-generate" }).click();
  const drawer = page.getByRole("dialog", { name: "Auto-generate a form" });
  await drawer.getByLabel("Site").selectOption({ label: "Hidd (Midal Cables)" });
  await drawer.getByLabel("Category").selectOption({ label: "Stationary combustion" });
  await drawer.getByRole("button", { name: "Next" }).click();

  await expect(drawer.getByText("This site and category already has a form")).toBeVisible();
  await expect(drawer.getByText("3 factors")).toBeVisible();
  await drawer.getByRole("switch", { name: "Per kWh" }).click();
  await drawer.getByLabel("Add another unit").fill("Tonne");
  await drawer.getByLabel("Add another unit").press("Enter");
  await expect(drawer.getByRole("list", { name: "Units to add" })).toContainText("tonne");
  await drawer.getByRole("button", { name: "Next" }).click();

  await expect(drawer.getByLabel("Form name")).toHaveValue("Hidd - Stationary combustion - litre");
  // A typed name belongs to its site and category: another pair starts from its own default.
  await drawer.getByLabel("Form name").fill("Hidd diesel");
  await drawer.getByRole("button", { name: "Back" }).click();
  await drawer.getByRole("button", { name: "Back" }).click();
  await drawer.getByLabel("Category").selectOption({ label: "Purchased electricity" });
  await drawer.getByRole("button", { name: "Next" }).click();
  await expect(drawer.getByRole("list", { name: "Units to add" })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Next" }).click();
  await expect(drawer.getByLabel("Form name")).toHaveValue("Hidd - Stationary combustion - litre + kWh");
  await drawer.getByRole("button", { name: "Back" }).click();
  await drawer.getByRole("button", { name: "Back" }).click();
  await drawer.getByLabel("Category").selectOption({ label: "Stationary combustion" });
  await drawer.getByRole("button", { name: "Next" }).click();
  await drawer.getByRole("button", { name: "Next" }).click();
  await expect(drawer.getByLabel("Form name")).toHaveValue("Hidd diesel");
  await expect(drawer.getByRole("heading", { name: "Factor rules (3)" })).toBeVisible();
  await expect(drawer.getByText("Diesel › Generator")).toBeVisible();
  await drawer.getByRole("button", { name: "Create and review" }).click();

  await expect(page).toHaveURL(/\/capture\/forms\/7$/);
  await expect(page.getByText('Form "Hidd diesel" created. Units added: kWh, tonne. Review it before contributors use it.')).toBeVisible();
  const body = calls.find((c) => c.path.endsWith("/auto-generate/confirm"))?.body as Record<string, unknown>;
  expect(body.config_name).toBe("Hidd diesel");
  expect((body.columns as { column_name: string }[]).map((c) => c.column_name)).toEqual(["fuel", "equipment", "quantity"]);
  expect(body.column_dependencies).toEqual({ equipment: "fuel" });
  expect(body.emission_category_mapping).toEqual({ "Diesel|Generator": "Diesel - Generator", "Diesel|Boiler": "Diesel - Boiler", "LPG|Boiler": "LPG - Boiler" });
  expect(body.create_units).toBe(true);
  expect(body.proposed_units).toEqual([
    { unit_name: "kWh", already_exists: false },
    { unit_name: "tonne", already_exists: false },
  ]);
});

test("form builder: edits show in the preview and save in one request", async ({ page }) => {
  const { calls } = await signIn(page);
  await routeTransport(page, calls);

  await page.goto("/capture/forms/7");
  await expect(page.getByRole("heading", { name: "Hidd transport", level: 1 })).toBeVisible();
  const preview = page.getByTestId("form-preview");

  // The preview follows the form's dependent choices and factor match.
  await preview.getByLabel("Mode").selectOption("road");
  await preview.getByLabel("Vehicle").selectOption("van");
  await expect(preview.getByText("Van - Diesel")).toBeVisible();

  // Add a field from the library: it appears in the preview at once.
  await page.getByRole("combobox", { name: "Add a field from the library" }).click();
  await page.getByRole("option", { name: /Notes/ }).click();
  await expect(preview.getByLabel("Notes")).toBeVisible();

  // Factor match flags a target with no factor and generates the missing rule.
  await page.getByRole("tab", { name: "Factor match" }).click();
  await expect(page.getByText("1 rule points to a category with no factor")).toBeVisible();
  await page.getByRole("button", { name: "Generate from choices (1)" }).click();
  await expect(page.getByLabel("Emission category for Road › HGV")).toHaveValue("Road - HGV");
  await page.getByLabel("Emission category for Road › HGV").fill("HGV - Diesel");

  // Choices of a dependent field are edited per parent choice.
  await page.getByRole("tab", { name: "Choices" }).click();
  await page.getByLabel("Field", { exact: true }).selectOption("vehicle");
  const road = page.locator('[data-branch="Road"]');
  // Saved choices keep their label: choice paths and factor rules use it.
  await expect(road.getByLabel("Choice 1 label")).toHaveAttribute("readonly", "");
  await road.getByRole("button", { name: "Add choice" }).click();
  await road.getByLabel("Choice 3 label").fill("Pickup truck");
  // A choice added in this session stays editable after switching tabs.
  await page.getByRole("tab", { name: "Fields" }).click();
  await page.getByRole("tab", { name: "Choices" }).click();
  await page.getByLabel("Field", { exact: true }).selectOption("vehicle");
  await expect(road.getByLabel("Choice 3 label")).not.toHaveAttribute("readonly", "");
  await preview.getByLabel("Mode").selectOption("road");
  await expect(preview.getByLabel("Vehicle").locator("option", { hasText: "Pickup truck" })).toHaveCount(1);

  // Leaving with unsaved changes asks first.
  await page.getByRole("link", { name: "Console" }).click();
  const leave = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "Stay" }).click();

  // Removing a saved choice asks before saving.
  await page.locator('[data-branch="Boat"]').getByRole("button", { name: "Remove choice Ferry" }).click();

  await page.getByRole("button", { name: "Save form" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Save changes that affect saved entries?" });
  await expect(confirm).toContainText('Vehicle no longer offers "Ferry".');
  await confirm.getByRole("button", { name: "Save form" }).click();
  await expect(page.getByText('Form "Hidd transport" saved')).toBeVisible();
  const body = calls.find((c) => c.method === "PUT")?.body as Record<string, unknown>;
  expect(body.column_ids).toEqual([1, 2, 4, 102]);
  expect(body.emission_category_mapping).toEqual({ "Road|Van": "Van - Diesel", "Boat|Ferry": "Ferry crossing", "Road|HGV": "HGV - Diesel" });
  expect((body.dependent_options as Record<string, Record<string, unknown[]>>).vehicle.Road).toEqual([
    { id: "van", label: "Van" },
    { id: "hgv", label: "HGV" },
    { id: "pickup_truck", label: "Pickup truck" },
  ]);
  expect((body.dependent_options as Record<string, Record<string, unknown[]>>).vehicle.Boat).toEqual([]);
  expect(body.rename_map).toBeUndefined();
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();
});

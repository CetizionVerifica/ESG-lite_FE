import { type Page, expect, test } from "@playwright/test";

/**
 * P20 Users (all clients) smoke tests (VITE_NEW_UI=1 server). The admin
 * endpoints answer from in-memory lists, and every write is recorded so the
 * tests can check what reached the server.
 */

type Cat = { category_id: number; category_name: string; scope: string | null };

const COMPANIES = [
  { company_id: 1, name: "Midal Cables" },
  { company_id: 2, name: "Gulf Foods" },
];
const FUEL: Cat = { category_id: 1, category_name: "Fuel", scope: "Scope 1" };
const POWER: Cat = { category_id: 2, category_name: "Electricity", scope: "Scope 2" };
const TRAVEL: Cat = { category_id: 3, category_name: "Business travel", scope: "Scope 3" };
const SITES = [
  { site_id: 1, name: "Hidd", company: COMPANIES[0], categories: [FUEL, POWER] },
  { site_id: 2, name: "Sitra", company: COMPANIES[0], categories: [TRAVEL] },
  { site_id: 3, name: "Pune", company: COMPANIES[1], categories: [POWER] },
];

function makeUsers() {
  return [
    { user_id: 4, name: "Omar", last_name: "Saleh", email: "omar@example.com", role: "User", site: null, sites: [SITES[0]], categories: [FUEL], last_login_at: null },
    { user_id: 5, name: "Mia", last_name: "Khan", email: "mia@example.com", role: "Manager", site: null, sites: [SITES[0], SITES[1]], categories: [FUEL, POWER, TRAVEL], last_login_at: new Date().toISOString() },
    { user_id: 6, name: "Ravi", email: "ravi@example.com", role: "Admin", site: SITES[2], sites: [], categories: [], last_login_at: null },
    { user_id: 1, name: "Sam", last_name: "Staff", email: "sam@example.com", role: "Superadmin", site: null, sites: [], categories: [], last_login_at: null },
  ];
}

async function signIn(page: Page) {
  let users = makeUsers();
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const me = { user_id: 1, name: "Sam", last_name: "Staff", email: "sam@example.com" };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Superadmin");
    localStorage.setItem("user", u);
  }, JSON.stringify(me));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const body = request.postDataJSON() as Record<string, unknown> | null;
      if (method !== "GET") calls.push({ method, path, body });

      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user: me });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/auth/forgot-password")) return json({ message: "If that email exists, a reset link has been sent." });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/companies")) return json(COMPANIES);
      if (path.endsWith("/admin/sites")) return json(SITES);

      const one = /\/admin\/users\/(\d+)$/.exec(path);
      if (one && method === "PATCH") {
        users = users.map((u) => (u.user_id === Number(one[1]) ? { ...u, ...(body as object) } : u));
        return json({ message: "User updated successfully" });
      }
      if (one && method === "DELETE") {
        if (Number(one[1]) === 4) {
          return json({ message: "This person has entries, reviews or history in ESGLite, so they can't be removed. Change their role or sites instead." }, 409);
        }
        users = users.filter((u) => u.user_id !== Number(one[1]));
        return json({ message: "User deleted successfully" });
      }
      if (path.endsWith("/admin/users") && method === "POST") {
        const ids = (body!.site_ids as number[]) ?? [];
        const created = {
          user_id: 9,
          name: body!.name as string,
          last_name: (body!.last_name as string) ?? null,
          email: body!.email as string,
          role: body!.role as string,
          site: null,
          sites: SITES.filter((s) => ids.includes(s.site_id)),
          categories: [FUEL, POWER, TRAVEL].filter((c) => ((body!.category_ids as number[]) ?? []).includes(c.category_id)),
          last_login_at: null,
        };
        users = [...users, created];
        return json({ message: "User created successfully", user: created, temporary_password: "Tmp-9xQ2-pass" }, 201);
      }
      if (path.endsWith("/admin/users")) return json(users);
      return json({});
    },
  );
  return { calls };
}

const usersTable = (page: Page) => page.getByRole("table", { name: "Users" });

async function pick(page: Page, label: string, option: string) {
  const box = page.getByRole("combobox", { name: label });
  await box.click();
  await box.fill(option.slice(0, 3));
  await page.getByRole("option", { name: option }).click();
}

test("a superadmin filters people and adds a user with a temporary password", async ({ page }) => {
  const { calls } = await signIn(page);
  // The Admin path sends a Superadmin here.
  await page.goto("/users");
  await expect(page).toHaveURL(/\/setup\/users/);
  const table = usersTable(page);
  await expect(table.getByRole("row")).toHaveCount(5);
  const omar = table.getByRole("row", { name: /Omar Saleh/ });
  await expect(omar).toContainText("Midal Cables");
  await expect(omar).toContainText("Hidd");
  await expect(omar).toContainText("Never");
  await expect(table.getByRole("row", { name: /Mia Khan/ })).toContainText("just now");

  // Role filter narrows the list and lives in the URL.
  await page.getByRole("button", { name: /Role:/ }).click();
  // click, not check(): the box turns on only after the URL round trip.
  await page.getByRole("checkbox", { name: "Admin", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Admin", exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/role=Admin/);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(page.getByTestId("setup-summary")).toHaveText("1 person of 4");
  await page.getByRole("button", { name: /Clear all/ }).click();

  // Add user: email, role, client and sites are required.
  await page.getByRole("button", { name: "Add user" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Add user" });
  await drawer.getByLabel("Name", { exact: true }).fill("Layla");
  await drawer.getByLabel("Email").fill("layla@example.com");
  await drawer.getByRole("button", { name: "Add user" }).click();
  await expect(drawer.getByText("Choose a role.")).toBeVisible();
  await drawer.getByLabel("Role").selectOption("User");
  await expect(drawer.getByText("Choose the client this person works for.")).toBeVisible();
  expect(calls).toHaveLength(0);
  await pick(page, "Client", "Midal Cables");
  await drawer.getByRole("checkbox", { name: "Hidd" }).check();
  // Hidd's categories switch on with it; turn Electricity off.
  await expect(drawer.getByRole("checkbox", { name: "Fuel" })).toBeChecked();
  await drawer.getByRole("checkbox", { name: "Electricity" }).uncheck();
  await drawer.getByRole("button", { name: "Add user" }).click();

  const done = page.getByRole("dialog", { name: "Layla added" });
  await expect(done.getByTestId("temporary-password")).toHaveText("Tmp-9xQ2-pass");
  expect(calls).toEqual([
    {
      method: "POST",
      path: expect.stringMatching(/\/admin\/users$/),
      body: { name: "Layla", email: "layla@example.com", role: "User", site_ids: [1], category_ids: [1] },
    },
  ]);
  await done.getByRole("button", { name: "Done" }).click();
  await expect(done).toBeHidden();
  await expect(table.getByRole("row", { name: /Layla/ })).toContainText("Hidd");
});

test("a superadmin demotes a manager, sends a reset link and sees why someone can't be removed", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/setup/users");
  await usersTable(page).getByRole("row", { name: /Mia Khan/ }).click();
  await expect(page).toHaveURL(/open=5/);
  // A shared link opens the same drawer.
  await page.reload();
  const drawer = page.getByRole("dialog", { name: "Mia Khan" });
  await expect(drawer.getByRole("button", { name: "Save" })).toBeDisabled();

  await drawer.getByLabel("Role").selectOption("User");
  await expect(drawer.getByText("Mia Khan loses Manager access")).toBeVisible();
  await expect(drawer.getByText("Approve and reject data for their sites")).toBeVisible();
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Mia Khan saved")).toBeVisible();
  expect(calls[0]).toEqual({
    method: "PATCH",
    path: expect.stringMatching(/\/admin\/users\/5$/),
    body: { role: "User", site_ids: [1, 2], category_ids: [1, 2, 3] },
  });

  // Row menu: reset link, then a refused removal explains itself.
  await page.getByRole("button", { name: "Actions for Omar Saleh" }).click();
  await page.getByRole("menuitem", { name: "Send reset link" }).click();
  await expect(page.getByText("Reset link sent to omar@example.com")).toBeVisible();
  expect(calls[1]).toMatchObject({ method: "POST", body: { email: "omar@example.com" } });

  await page.getByRole("button", { name: "Actions for Omar Saleh" }).click();
  await page.getByRole("menuitem", { name: "Remove…" }).click();
  const confirm = page.getByRole("alertdialog", { name: 'Delete user "omar@example.com"?' });
  const del = confirm.getByRole("button", { name: "Delete user" });
  await expect(del).toBeDisabled();
  await confirm.getByLabel(/Type omar@example.com to confirm/).fill("omar@example.com");
  await del.click();
  await expect(confirm.getByText(/history in ESGLite, so they can't be removed/)).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Actions for Ravi" }).click();
  await page.getByRole("menuitem", { name: "Remove…" }).click();
  const ravi = page.getByRole("alertdialog", { name: 'Delete user "ravi@example.com"?' });
  await ravi.getByLabel(/Type ravi@example.com to confirm/).fill("ravi@example.com");
  await ravi.getByRole("button", { name: "Delete user" }).click();
  await expect(page.getByText("Ravi removed")).toBeVisible();
  await expect(usersTable(page).getByRole("row")).toHaveCount(4);

  // Their own row: no Remove, and the role is locked.
  await page.getByRole("button", { name: "Actions for Sam Staff" }).click();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Remove…" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const self = page.getByRole("dialog", { name: "Sam Staff" });
  await expect(self.getByLabel("Role")).toBeDisabled();
  await expect(self.getByRole("button", { name: "Remove" })).toHaveCount(0);
});

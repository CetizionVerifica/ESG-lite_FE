import { type Page, expect, test } from "@playwright/test";

/**
 * DS-0 · The Design Studio switch and gating. In-memory API:
 * `/admin/companies` for the Superadmin, `/studio/status` for the client's
 * people. Every write is recorded so the tests check what reached the server.
 */

type Call = { method: string; path: string; body: unknown };
type Status = { enabled: boolean; kinds: { ghg: boolean; sustainability: boolean } } | null;

const ACME = { company_id: 1, name: "ACME", status: true, kpi_tracking_enabled: false, design_studio_enabled: false };

async function mockApi(page: Page, role: string, user: object, opts: { companies?: object[]; studio?: Status } = {}) {
  const calls: Call[] = [];
  let companies = (opts.companies ?? [ACME]).map((c) => ({ ...c }));
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
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const body = method === "GET" ? null : (request.postDataJSON() as Record<string, unknown> | null);
      calls.push({ method, path, body });

      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/kpi/status")) return json({ enabled: false, setup_completed: false });
      if (path.endsWith("/studio/status")) return json(opts.studio ?? {});
      if (path.startsWith("/studio/")) return json({ code: "DS_STUDIO_OFF", message: "Off" }, 403);
      const one = /\/admin\/companies\/(\d+)$/.exec(path);
      if (one && method === "PUT") {
        companies = companies.map((c) => (c.company_id === Number(one[1]) ? { ...c, ...body } : c));
        return json({ message: "Company updated" });
      }
      if (path.endsWith("/admin/companies")) return json(companies);
      if (path.endsWith("/admin/sites")) return json([{ site_id: 1, name: "Bahrain plant", company: { company_id: 1 }, country: { name: "Bahrain" } }]);
      if (path.endsWith("/admin/users")) return json([]);
      return json({});
    },
  );
  return calls;
}

const managerAt = (studio: boolean, kpi = false) => ({
  user_id: 12,
  name: "Mia Haddad",
  email: "mia@acme.example",
  sites: [{ site_id: 1, name: "Bahrain plant", company: { company_id: 1, name: "ACME", design_studio_enabled: studio, kpi_tracking_enabled: kpi } }],
});
const ON = { enabled: true, kinds: { ghg: true, sustainability: false } };
const OFF = { enabled: false, kinds: { ghg: false, sustainability: false } };

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET" && c.method !== "OPTIONS");
const reportsMenu = async (page: Page) => {
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Reports" }).click();
  return page.getByRole("menu");
};

test("with the switch off, a manager has no Design Studio item, and /studio shows not available", async ({ page }) => {
  await mockApi(page, "Manager", managerAt(false), { studio: OFF });
  await page.goto("/settings");
  const menu = await reportsMenu(page);
  await expect(menu.getByRole("menuitem", { name: "GHG report" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Design Studio" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/studio");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to your home page" })).toHaveAttribute("href", "/overview");
  // The command palette doesn't offer it either.
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search pages" }).fill("design");
  await expect(page.getByRole("option", { name: /Design Studio|report design/ })).toHaveCount(0);
});

test("with the switch on, a manager finds Design Studio under Reports and opens it", async ({ page }) => {
  await mockApi(page, "Manager", managerAt(true), { studio: ON });
  await page.goto("/settings");
  const menu = await reportsMenu(page);
  await menu.getByRole("menuitem", { name: "Design Studio" }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole("heading", { name: "Design Studio", level: 1 })).toBeVisible();
  // GHG is available; sustainability needs KPI tracking (05-ux S10).
  // DS-5 home: the "What will you design?" cards.
  await expect(page.getByTestId("studio-start-ghg").getByRole("link")).toHaveAttribute("href", "/studio/new?kind=ghg&format=a4&purpose=report");
  await expect(page.getByTestId("studio-start-sustainability")).toContainText("Needs KPI tracking");
  await expect(page.getByTestId("studio-start-sustainability").getByRole("link")).toHaveCount(0);

  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search pages" }).fill("design");
  await expect(page.getByRole("option", { name: /New GHG report design/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /New sustainability report design/ })).toHaveCount(0);
});

test("the server's switch wins over the session: turned off since sign-in hides the item", async ({ page }) => {
  await mockApi(page, "Manager", managerAt(true), { studio: OFF });
  await page.goto("/studio/new?kind=ghg");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  const menu = await reportsMenu(page);
  await expect(menu.getByRole("menuitem", { name: "Design Studio" })).toHaveCount(0);
});

test("a user never sees the studio, even with the switch on", async ({ page }) => {
  const user = { user_id: 11, name: "Ravi Kumar", email: "ravi@acme.example", site: { site_id: 1, name: "Bahrain plant", company: { company_id: 1, design_studio_enabled: true } } };
  await mockApi(page, "User", user, { studio: ON });
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByText("Design Studio")).toHaveCount(0);
});

test("a superadmin turns Design Studio on, and confirms before turning it off", async ({ page }) => {
  const calls = await mockApi(page, "Superadmin", { name: "Sam Staff", email: "sam@example.com" });
  await page.goto("/clients/1");
  const toggle = page.getByRole("switch", { name: "Design Studio" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Off. ACME's people don't see Design Studio.")).toBeVisible();

  await toggle.click();
  await expect(page.getByText("Design Studio is on for ACME. Their Admins and Managers will see it under Reports.")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("On. ACME can design GHG reports. Sustainability reports also need KPI tracking.")).toBeVisible();
  expect(writes(calls)).toContainEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/companies\/1$/), body: { design_studio_enabled: true } });

  const before = writes(calls).length;
  await toggle.click();
  const confirm = page.getByRole("group", { name: /Hide Design Studio for ACME\?/ });
  await expect(confirm).toBeFocused();
  await confirm.getByRole("button", { name: "Keep it on" }).click();
  await expect(confirm).toHaveCount(0);
  expect(writes(calls)).toHaveLength(before);

  await toggle.click();
  await page.getByRole("button", { name: "Hide Design Studio" }).click();
  await expect(page.getByText("Design Studio is off for ACME. Their designs are kept.")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(writes(calls).at(-1)).toEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/companies\/1$/), body: { design_studio_enabled: false } });
});

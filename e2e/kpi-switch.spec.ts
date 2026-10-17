import { type Page, expect, test } from "@playwright/test";

/**
 * KPI-1 · The client switch and gating. In-memory API: `/admin/companies`
 * for the Superadmin, `/kpi/status` for the client's people. Every write is
 * recorded so the tests check what reached the server.
 */

type Call = { method: string; path: string; body: unknown };

const ACME = { company_id: 1, name: "ACME", status: true, ai_import_enabled: false, kpi_tracking_enabled: false };

async function mockApi(page: Page, role: string, user: object, opts: { companies?: object[]; kpiStatus?: boolean | null } = {}) {
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
      if (path.endsWith("/kpi/status")) {
        if (opts.kpiStatus === null || opts.kpiStatus === undefined) return json({});
        return json({ enabled: opts.kpiStatus, setup_completed: false });
      }
      if (path.startsWith("/kpi/") || path === "/kpi") return json({ code: "KPI_TRACKING_OFF", message: "Off" }, 403);
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

const userAt = (kpi: boolean) => ({
  user_id: 11,
  name: "Ravi Kumar",
  email: "ravi@acme.example",
  site: { site_id: 1, name: "Bahrain plant", company: { company_id: 1, name: "ACME", kpi_tracking_enabled: kpi } },
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET" && c.method !== "OPTIONS");

test("a superadmin turns KPI tracking on, and confirms before turning it off", async ({ page }) => {
  const calls = await mockApi(page, "Superadmin", { name: "Sam Staff", email: "sam@example.com" });
  await page.goto("/clients/1");
  const toggle = page.getByRole("switch", { name: "KPI tracking" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Off. ACME's users don't see anything about KPIs.")).toBeVisible();

  await toggle.click();
  await expect(page.getByText("KPI tracking is on for ACME. Their Admins will see KPI setup.")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(writes(calls)).toContainEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/companies\/1$/), body: { kpi_tracking_enabled: true } });

  // Turning it off asks first, in the page; "Keep it on" changes nothing.
  const before = writes(calls).length;
  await toggle.click();
  const confirm = page.getByRole("group", { name: /Hide KPI tracking for ACME\?/ });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("Their values are kept and come back if you turn it on again.");
  await expect(confirm).toBeFocused();
  await confirm.getByRole("button", { name: "Keep it on" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(writes(calls)).toHaveLength(before);

  await toggle.click();
  await page.getByRole("button", { name: "Hide KPI tracking" }).click();
  await expect(page.getByText("KPI tracking is off for ACME. Their values are kept.")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(writes(calls).at(-1)).toEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/companies\/1$/), body: { kpi_tracking_enabled: false } });
});

test("Esc closes the turn-off question without saving", async ({ page }) => {
  const calls = await mockApi(page, "Superadmin", { name: "Sam Staff" }, { companies: [{ ...ACME, kpi_tracking_enabled: true }] });
  await page.goto("/clients/1");
  await page.getByRole("switch", { name: "KPI tracking" }).click();
  await expect(page.getByRole("group", { name: /Hide KPI tracking/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: /Hide KPI tracking/ })).toHaveCount(0);
  expect(writes(calls)).toEqual([]);
});

test("with the switch off, a user sees no KPI nav and gets the not-available page on /kpi", async ({ page }) => {
  await mockApi(page, "User", userAt(false), { kpiStatus: false });
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "Add data" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "My KPIs" })).toHaveCount(0);

  await page.goto("/kpi");
  await expect(page.getByText("KPI tracking isn't turned on for your company.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to your home page" })).toHaveAttribute("href", "/my-month");
  // The command palette doesn't offer it either.
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search pages" }).fill("KPI");
  await expect(page.getByRole("option", { name: /My KPIs/ })).toHaveCount(0);
});

test("with the switch on, a user sees My KPIs in the nav and can open it", async ({ page }) => {
  await mockApi(page, "User", userAt(true), { kpiStatus: true });
  await page.goto("/settings");
  const link = page.getByRole("link", { name: "My KPIs" }).first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/kpi$/);
  await expect(page.getByRole("heading", { name: "My KPIs", level: 1 })).toBeVisible();
  await expect(page.getByText("Your KPI list is coming in the next build step.")).toBeVisible();
});

test("the server's switch wins over the session: turned on since sign-in shows the nav", async ({ page }) => {
  await mockApi(page, "User", userAt(false), { kpiStatus: true });
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "My KPIs" }).first()).toBeVisible();
});

test("a session that says on still lands on not-available once the server says off", async ({ page }) => {
  await mockApi(page, "User", userAt(true), { kpiStatus: false });
  await page.goto("/kpi");
  await expect(page.getByText("KPI tracking isn't turned on for your company.")).toBeVisible();
  await expect(page.getByRole("link", { name: "My KPIs" })).toHaveCount(0);
});

test("a manager with the switch on gets KPIs under Data and Framework reports under Reports", async ({ page }) => {
  const manager = { user_id: 12, name: "Mia Haddad", email: "mia@acme.example", sites: [{ site_id: 1, name: "Bahrain plant", company: { company_id: 1, kpi_tracking_enabled: true } }] };
  await mockApi(page, "Manager", manager, { kpiStatus: true });
  await page.goto("/kpi/dashboard");
  await expect(page.getByRole("heading", { name: "KPIs", level: 1 })).toBeVisible();
  await page.goto("/reports/kpi/GRI");
  await expect(page.getByRole("heading", { name: "Framework reports", level: 1 })).toBeVisible();
});

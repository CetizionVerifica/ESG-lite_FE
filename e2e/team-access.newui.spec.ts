import { type Page, expect, test } from "@playwright/test";

/**
 * P09 Team access smoke tests (VITE_NEW_UI=1 server). /manager/users and
 * /manager/submission-status are answered from an in-memory list, and every
 * write is recorded so the tests can check what reached the server.
 */

type Category = { category_id: number; category_name: string; has_access: boolean };
type TeamUser = {
  user_id: number;
  name: string;
  last_name: string;
  email: string;
  role: string;
  sites: { site_id: number; site_name: string; categories: Category[] }[];
};

const company = { company_id: 1, name: "Midal Cables" };
const SITES = [
  { site_id: 1, name: "Hidd" },
  { site_id: 2, name: "Sitra" },
];
const manager = { name: "Mia Manager", email: "mia@example.com", sites: SITES.map((s) => ({ ...s, company })) };

const cat = (id: number, name: string, on: boolean): Category => ({ category_id: id, category_name: name, has_access: on });

function makeTeam(): TeamUser[] {
  return [
    {
      user_id: 4,
      name: "Omar",
      last_name: "Saleh",
      email: "omar@example.com",
      role: "User",
      sites: [
        { site_id: 1, site_name: "Hidd", categories: [cat(1, "Fuel", true), cat(2, "Electricity", false)] },
        // Fuel is on both sites: one switch for both.
        { site_id: 2, site_name: "Sitra", categories: [cat(1, "Fuel", true), cat(3, "Refrigerants", true)] },
      ],
    },
    {
      user_id: 5,
      name: "Layla",
      last_name: "Haddad",
      email: "layla@example.com",
      role: "User",
      sites: [{ site_id: 2, site_name: "Sitra", categories: [cat(1, "Fuel", true), cat(3, "Refrigerants", true)] }],
    },
  ];
}

async function signIn(page: Page, opts: { failSave?: boolean } = {}) {
  const team = makeTeam();
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", u);
  }, JSON.stringify(manager));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (method !== "GET") calls.push({ method, path, body: request.postDataJSON() });

      if (path.endsWith("/auth/me")) return json({ role: "Manager", user: manager });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/manager/submission-status")) {
        return json({
          month: url.searchParams.get("month"),
          users: [
            { user_id: 4, name: "Omar Saleh", email: "omar@example.com", site_name: "Hidd", submission_count: 3, status: "submitted" },
            { user_id: 5, name: "Layla Haddad", email: "layla@example.com", site_name: "Sitra", submission_count: 0, status: "missing" },
          ],
        });
      }
      const put = /\/manager\/users\/(\d+)\/categories$/.exec(path);
      if (put && method === "PUT") {
        if (opts.failSave) return json({ message: "Categories not available on user's sites: 9" }, 400);
        const ids = (request.postDataJSON() as { category_ids: number[] }).category_ids;
        const u = team.find((t) => t.user_id === Number(put[1]))!;
        for (const s of u.sites) for (const c of s.categories) c.has_access = ids.includes(c.category_id);
        return json({ message: "ok" });
      }
      if (path.endsWith("/manager/users")) return json(team);
      return json({});
    },
  );
  return { calls };
}

const teamTable = (page: Page) => page.getByRole("table", { name: "Team" });

test("a manager searches the team and changes one person's category access", async ({ page }) => {
  const { calls } = await signIn(page);
  // The old path still lands here.
  await page.goto("/manage-users");
  await expect(page).toHaveURL(/\/team/);
  const table = teamTable(page);
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(page.getByTestId("people-count")).toHaveText("2 people · 1 missing this month");
  const omar = table.getByRole("row", { name: /Omar Saleh/ });
  await expect(omar).toContainText("3 of 4");
  await expect(omar).toContainText("Submitted");
  await expect(table.getByRole("row", { name: /Layla Haddad/ })).toContainText("Missing");

  // Search narrows the list.
  await page.getByPlaceholder("Search name, email or site").fill("layla");
  await expect(table.getByRole("row")).toHaveCount(2);
  await page.getByPlaceholder("Search name, email or site").fill("");

  await page.getByRole("button", { name: "Manage access for Omar Saleh" }).click();
  const drawer = page.getByRole("dialog", { name: "Category access — Omar Saleh" });
  await expect(drawer.getByText("Access is set per category, not per site.")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Save" })).toBeDisabled();

  // Disable all on Sitra also turns Fuel off on Hidd (same category).
  await drawer.getByRole("button", { name: "Disable all on Sitra" }).click();
  await expect(drawer.getByRole("switch", { name: "Fuel on Hidd" })).toHaveAttribute("aria-checked", "false");
  // With nothing left, saving is blocked and says why.
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer.getByText(/Keep at least one category enabled/)).toBeVisible();
  expect(calls).toHaveLength(0);

  await drawer.getByRole("switch", { name: "Electricity on Hidd" }).click();
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Access updated for Omar Saleh")).toBeVisible();
  await expect(drawer).toBeHidden();
  expect(calls).toEqual([{ method: "PUT", path: "/manager/users/4/categories", body: { category_ids: [2] } }]);
  await expect(omar).toContainText("1 of 4");
});

test("the site filter narrows people and save errors stay in the drawer", async ({ page }) => {
  await signIn(page, { failSave: true });
  await page.goto("/team?site=1");
  const table = teamTable(page);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByRole("row", { name: /Omar Saleh/ })).toContainText("1 of 2");

  await table.getByRole("row", { name: /Omar Saleh/ }).click();
  const drawer = page.getByRole("dialog", { name: "Category access — Omar Saleh" });
  await drawer.getByRole("button", { name: "Enable all on Hidd" }).click();
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer.getByText("Couldn't save access")).toBeVisible();
  await expect(drawer).toContainText("Categories not available on user's sites: 9");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  await page.goto("/team?q=nobody");
  await expect(page.getByText("No one matches these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(table.getByRole("row")).toHaveCount(3);
});

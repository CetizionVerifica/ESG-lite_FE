import { type Page, expect, test } from "@playwright/test";

/**
 * P02 My month smoke test. Runs against the dev server started with
 * VITE_NEW_UI=1 (project "new-ui"); every API call is answered locally.
 */

const company = { company_id: 3, name: "Glochem" };
const user = { name: "Uma User", email: "uma@example.com", site: { site_id: 7, company } };
const brand = { companyId: 3, name: "Glochem", primary: "#a01c2c", accent: "#333333", coverFrom: "#a01c2c", coverTo: "#333333", logoUrl: null };

const category = (over: object) => ({
  scope: "Scope 1",
  status: "todo",
  filing: null,
  year_type: null,
  period: null,
  entries: { total: 0, pending: 0, approved: 0, rejected: 0 },
  total_emission: 0,
  last_entry_at: null,
  rejections: [],
  ...over,
});

const september = {
  month: "2025-09",
  due_date: "2025-10-10",
  escalation_date: "2025-10-15",
  summary: { total: 4, due: 1, done: 1, pending: 1, rejected: 1 },
  sites: [
    {
      site_id: 7,
      name: "Hidd plant",
      categories: [
        category({ category_id: 1, category_name: "Diesel", status: "approved", filing: "monthly", total_emission: 4.29, entries: { total: 1, pending: 0, approved: 1, rejected: 0 } }),
        category({ category_id: 2, category_name: "LPG" }),
        category({ category_id: 3, category_name: "Grid electricity", scope: "Scope 2", status: "pending", filing: "monthly", total_emission: 312.4, entries: { total: 1, pending: 1, approved: 0, rejected: 0 } }),
        category({
          category_id: 4,
          category_name: "Petrol",
          status: "rejected",
          filing: "monthly",
          entries: { total: 1, pending: 0, approved: 0, rejected: 1 },
          rejections: [{ pk_id: 91, review_comment: "Wrong unit, should be litres", reviewed_by: "Mia Manager", reviewed_at: "2025-10-02T09:00:00.000Z" }],
        }),
      ],
    },
  ],
};

async function signIn(page: Page, months: Record<string, object>, requested: (string | null)[] = []) {
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "User");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const url = new URL(route.request().url());
      const json = (body: unknown) => route.fulfill({ json: body });
      if (url.pathname.endsWith("/user/my-month")) {
        const m = url.searchParams.get("month");
        requested.push(m);
        return json(months[m ?? "default"] ?? months.default);
      }
      if (url.pathname.endsWith("/auth/me")) return json({ role: "User", user });
      if (url.pathname.endsWith("/auth/me/appearance")) return json({ appearance: "system" });
      if (url.pathname.endsWith("/brands/mine")) return json(brand);
      if (url.pathname.endsWith("/notifications/unread")) return json({ count: 0 });
      if (url.pathname.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      return json({});
    },
  );
}

test("contributor sees what is owed, rejected first, and each to-do opens the entry form", async ({ page }) => {
  await signIn(page, { default: september });
  await page.goto("/");
  await expect(page).toHaveURL(/\/my-month/);
  await expect(page.getByRole("heading", { level: 1, name: "September 2025" })).toBeVisible();
  await expect(page.getByText("2 of 4 categories filed.")).toBeVisible();

  const sentBack = page.getByRole("region", { name: "Sent back to you" });
  await expect(sentBack.getByText("Wrong unit, should be litres")).toBeVisible();
  await expect(sentBack.getByRole("link", { name: "Fix Petrol" })).toHaveAttribute("href", "/data/new?site=7&category=4&period=2025-09");

  const scope1 = page.getByRole("list", { name: "Scope 1" });
  await expect(scope1.getByRole("listitem").first()).toContainText("Petrol");
  await scope1.getByRole("link", { name: "Add LPG" }).click();
  await expect(page).toHaveURL(/\/data\/new\?site=7&category=2&period=2025-09$/);
});

test("the month switcher asks for the previous month and keeps it in the URL", async ({ page }) => {
  const requested: (string | null)[] = [];
  const august = { ...september, month: "2025-08", due_date: "2025-09-10", escalation_date: "2025-09-15", sites: [{ ...september.sites[0], categories: [september.sites[0].categories[0]] }] };
  await signIn(page, { default: september, "2025-08": august }, requested);
  await page.goto("/my-month");
  await expect(page.getByRole("heading", { level: 1, name: "September 2025" })).toBeVisible();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page).toHaveURL(/period=2025-08/);
  await expect(page.getByRole("heading", { level: 1, name: "August 2025" })).toBeVisible();
  await expect(page.getByText("All 1 category is in. Nice work.")).toBeVisible();
  expect(requested).toContain("2025-08");
});

test("a contributor with nothing assigned is told to ask for access", async ({ page }) => {
  await signIn(page, { default: { ...september, sites: [] } });
  await page.goto("/my-month");
  await expect(page.getByText("Ask your manager for access")).toBeVisible();
});

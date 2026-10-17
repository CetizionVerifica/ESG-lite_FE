import { type Page, expect, test } from "@playwright/test";

/**
 * P02 My month smoke test. Every API call is answered locally.
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
    (url) => url.port !== "4173",
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

test("with the review workflow off there are no drafts, no submit and no Nothing this month", async ({ page }) => {
  await signIn(page, { default: september });
  await page.goto("/my-month");
  await expect(page.getByRole("heading", { level: 1, name: "September 2025" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Submit drafts" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Nothing this month/ })).toHaveCount(0);
  await expect(page.getByText("Draft", { exact: true })).toHaveCount(0);
});

// S3-15 part 2: the company's review_workflow_v2 switch is on.
const workflowUser = { ...user, site: { site_id: 7, company: { ...company, review_workflow_v2: true } } };

const draft = (pk_id: number, category_id: number, category_name: string, tco2e: number) => ({
  pk_id,
  status: "draft",
  total_emission: tco2e,
  date_of_reporting: "2025-09-30",
  activity_data: { emission_category: category_name },
  site: { site_id: 7, name: "Hidd plant" },
  category: { category_id, category_name },
});

async function signInWithWorkflow(page: Page) {
  const state = {
    drafts: [draft(501, 1, "Diesel", 1.2), draft(502, 3, "Grid electricity", 40.5), draft(503, 3, "Grid electricity", 2.25)],
    nothing: false,
    calls: [] as { method: string; path: string; body: unknown }[],
  };
  const month = () => ({
    ...september,
    review_workflow_v2: true,
    sites: [
      {
        ...september.sites[0],
        categories: september.sites[0].categories.map((c) =>
          // ESG-lite marks it `nothing: true` with status "nothing".
          c.category_id === 2 ? { ...c, nothing: state.nothing, status: state.nothing ? "nothing" : c.status } : c.category_id === 1 ? { ...c, entries: { ...c.entries, draft: 1 } } : c,
        ),
      },
    ],
  });
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "User");
    localStorage.setItem("user", u);
  }, JSON.stringify(workflowUser));
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
      if (method !== "GET") state.calls.push({ method, path, body: request.postDataJSON() });
      if (path.endsWith("/user/my-month/nothing")) {
        state.nothing = method === "POST";
        return json({ site_id: 7, category_id: 2, month: "2025-09-01", nothing: state.nothing });
      }
      if (path.endsWith("/user/my-month")) return json(month());
      if (path.endsWith("/user/emissions/submit")) {
        const ids = (request.postDataJSON() as { ids: number[] }).ids;
        state.drafts = state.drafts.filter((d) => !ids.includes(d.pk_id));
        return json({ submitted: ids, refused: [] });
      }
      if (path.endsWith("/user/emissions") && url.searchParams.get("status") === "draft") return json({ data: state.drafts, total: state.drafts.length, summary: {} });
      if (path.endsWith("/auth/me")) return json({ role: "User", user: workflowUser });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "system" });
      if (path.endsWith("/brands/mine")) return json(brand);
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      return json({});
    },
  );
  return state;
}

test("with the review workflow on, a contributor submits 3 drafts and marks one category Nothing this month", async ({ page }) => {
  const state = await signInWithWorkflow(page);
  await page.goto("/my-month");

  const drafts = page.getByRole("region", { name: "Drafts (3)" });
  await expect(drafts).toBeVisible();
  await expect(drafts.getByText("Draft", { exact: true })).toHaveCount(3);
  // A rejected row's Fix opens that row in Add data.
  await expect(page.getByRole("region", { name: "Sent back to you" }).getByRole("link", { name: "Fix Petrol" })).toHaveAttribute("href", "/data/new?site=7&category=4&period=2025-09&fix=91");

  const bar = page.getByRole("region", { name: "Submit drafts" });
  await expect(bar.getByRole("button", { name: "Submit" })).toBeDisabled();
  await drafts.getByLabel("Select all").check();
  await expect(bar.getByText("3 of 3 selected")).toBeVisible();
  await bar.getByRole("button", { name: "Submit 3 rows" }).click();
  await expect(page.getByText("3 rows sent for approval")).toBeVisible();
  expect(state.calls.find((c) => c.path.endsWith("/user/emissions/submit"))?.body).toEqual({ ids: [501, 502, 503] });
  await expect(page.getByRole("region", { name: /^Drafts/ })).toHaveCount(0);

  // Nothing this month: confirm, then undo from the toast.
  await page.getByRole("button", { name: "Nothing this month for LPG" }).click();
  const dialog = page.getByRole("dialog", { name: "Nothing to report for LPG in September 2025?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Mark as nothing this month" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.calls.find((c) => c.method === "POST" && c.path.endsWith("/user/my-month/nothing"))?.body).toEqual({ site_id: 7, category_id: 2, month: "2025-09-01" });
  const lpg = page.getByRole("list", { name: "Scope 1" }).getByRole("listitem").filter({ hasText: "LPG" });
  await expect(lpg.getByText("Nothing this month", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => state.calls.some((c) => c.method === "DELETE" && c.path.endsWith("/user/my-month/nothing"))).toBe(true);
  await expect(lpg.getByRole("button", { name: "Nothing this month for LPG" })).toBeVisible();
});

test("a locked month is read-only with a Locked banner", async ({ page }) => {
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "User");
    localStorage.setItem("user", u);
  }, JSON.stringify(workflowUser));
  const locked = { ...september, review_workflow_v2: true, sites: [{ ...september.sites[0], locked: true }] };
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/user/my-month")) return route.fulfill({ json: locked });
      if (path.endsWith("/user/emissions")) return route.fulfill({ json: { data: [], total: 0, summary: {} } });
      if (path.endsWith("/auth/me")) return route.fulfill({ json: { role: "User", user: workflowUser } });
      if (path.endsWith("/brands/mine")) return route.fulfill({ json: brand });
      return route.fulfill({ json: {} });
    },
  );
  await page.goto("/my-month");
  await expect(page.getByText("September 2025 is locked")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add data" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add LPG" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Fix/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Nothing this month/ })).toHaveCount(0);
});

import { type Page, expect, test } from "@playwright/test";

/**
 * S3-14 Scope 3 base year smoke tests. /scope3/base-year, its preview and
 * /scope3/recalculations answer from an in-memory company; the targets page
 * reads the same base year.
 */

const NAMES = [
  "Purchased goods and services", "Capital goods", "Fuel- and energy-related activities", "Upstream transportation and distribution",
  "Waste generated in operations", "Business travel", "Employee commuting", "Upstream leased assets",
  "Downstream transportation and distribution", "Processing of sold products", "Use of sold products",
  "End-of-life treatment of sold products", "Downstream leased assets", "Franchises", "Investments",
];
const TOTALS = [
  ...NAMES.map((_, i) => ({ n: i + 1, tco2e: i === 0 ? 6000 : i === 3 ? 4000 : 0 })),
  { n: null, tco2e: 0 },
];
const company = { company_id: 1, name: "Midal Cables" };
const SITES = [{ site_id: 1, name: "Hidd", company }];

type Opts = { role: "Admin" | "Manager"; frozen?: boolean; proposal?: boolean };

async function signIn(page: Page, opts: Opts) {
  const user = { name: opts.role === "Admin" ? "Priya Admin" : "Mia Manager", email: "p@example.com", sites: SITES };
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  let row: Record<string, unknown> | null = opts.frozen
    ? { id: 1, company_id: 1, scope: "Scope 3", base_year: 2023, year_type: "CY", significance_pct: 5, policy_note: null, rationale: "First year with supplier data",
        snapshot: { version: 1, frozen_at: "2026-01-05T00:00:00Z", base_year: 2023, year_type: "CY", total_tco2e: 10000, categories: TOTALS, rows: 12 }, updated_at: "2026-01-05T00:00:00Z" }
    : null;
  let events: Array<Record<string, unknown>> = opts.proposal
    ? [{ id: 9, reason: "error", status: "proposed", affected_years: [2023], delta_tco2e: 720, note: null,
        before: { total_tco2e: 10000, categories: TOTALS }, after: { total_tco2e: 10720, categories: TOTALS.map((t) => (t.n === 1 ? { ...t, tco2e: 6720 } : t)) },
        changes: [{ reason: "error", kind: "edited", n: 1, site_id: 1, rows: 2, delta_tco2e: 720 }], delta_pct: 7.2, threshold_tco2e: 500, largest_category: 1,
        approved_by_name: null, decided_at: null, created_at: "2026-10-16T02:40:00Z" }]
    : [];

  await page.addInitScript(
    ([u, r]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [JSON.stringify(user), opts.role] as const,
  );
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      if (method !== "GET") calls.push({ method, path, body });

      if (path.endsWith("/auth/me")) return json({ role: opts.role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/scope3/categories")) {
        const categories = NAMES.map((name, i) => ({
          n: i + 1, key: `k${i + 1}`, name, direction: i < 8 ? "upstream" : "downstream", methods: [], relevance: null, mapped_categories: [],
          status: "included", reason: null, method_note: null, updated_at: null, updated_by: null,
        }));
        return json({ company_id: 1, consolidation_approach: "operational_control", summary: { included: 15, excluded: 0, not_relevant: 0, screening: 0 },
          unmapped_count: 0, categories, can_edit: opts.role === "Admin", can_confirm_map: false });
      }
      if (path.endsWith("/scope3/category-map")) return json({ company_id: 1, unmapped: [], mapped: [] });
      if (path.endsWith("/scope3/base-year/preview")) {
        const year = Number(url.searchParams.get("base_year"));
        if (year !== 2023) return json({ code: "BASE_YEAR_NO_DATA", message: "The base year has no approved data." }, 422);
        return json({ base_year: 2023, year_type: "CY", total_tco2e: 10000, categories: TOTALS, rows: 12 });
      }
      if (path.endsWith("/scope3/base-year") && method === "PUT") {
        row = { id: 1, company_id: 1, scope: "Scope 3", base_year: body.base_year, year_type: body.year_type, significance_pct: body.significance_pct,
          policy_note: body.policy_note, rationale: body.rationale,
          snapshot: { version: 1, frozen_at: "2026-10-16T02:00:00Z", base_year: body.base_year, year_type: body.year_type, total_tco2e: 10000, categories: TOTALS, rows: 12 },
          updated_at: "2026-10-16T02:00:00Z" };
        return json(row);
      }
      if (path.endsWith("/scope3/base-year"))
        return json({ base_year: row, approved_recalculations: [], drift: null, open_proposal: events.find((e) => e.status === "proposed") ?? null, can_edit: opts.role === "Admin" });
      if (path.endsWith("/scope3/recalculations") && method === "POST") {
        events = events.map((e) => (e.status === "proposed" ? { ...e, status: "approved", reason: body.reason, note: body.note, approved_by_name: user.name, decided_at: "2026-10-16T03:00:00Z" } : e));
        return json({ event: events[0], base_year: row });
      }
      if (path.endsWith("/scope3/recalculations")) return json({ events, can_edit: opts.role === "Admin" });
      if (path.endsWith("/user/targets/tables")) return json({ message: "No approved emissions found." }, 400);
      if (path.endsWith("/manager/overview")) return json({ kpis: { gross: 0 }, yearly_total: 0 });
      return json({});
    },
  );
  return { calls };
}

test("an admin sets 2023 with a rationale, freezes it and sees the totals", async ({ page }) => {
  const { calls } = await signIn(page, { role: "Admin" });
  await page.goto("/settings/scope3#base-year");
  const section = page.getByTestId("base-year");
  await expect(section.getByRole("heading", { name: "Base year" })).toBeVisible();

  await section.getByRole("combobox", { name: "Base year" }).selectOption("2023");
  await section.getByRole("button", { name: "Freeze base year" }).click();
  await expect(section.getByText("Say why this year is the base year.")).toBeVisible();
  await section.getByRole("textbox", { name: /Rationale/ }).fill("First year with supplier data");
  await section.getByRole("button", { name: "Freeze base year" }).click();

  const dialog = page.getByRole("dialog", { name: "Freeze 2023 as the Scope 3 base year?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("row", { name: /Category 1 · Purchased goods and services/ })).toContainText("6,000");
  await expect(dialog.getByRole("row", { name: /Scope 3 total/ })).toContainText("10,000");
  await dialog.getByRole("button", { name: "Freeze base year" }).click();
  await expect(dialog).toBeHidden();

  const put = calls.find((c) => c.method === "PUT" && c.path.endsWith("/scope3/base-year"));
  expect(put?.body).toMatchObject({ base_year: 2023, year_type: "CY", significance_pct: 5, rationale: "First year with supplier data" });
  await expect(page.getByTestId("frozen-totals")).toContainText("2023");
  await expect(page.getByTestId("frozen-totals")).toContainText("10,000");
  await expect(page.getByTestId("no-recalc")).toHaveText("No changes since you froze 2023.");
});

test("an admin approves a proposed recalculation with a reason and note", async ({ page }) => {
  const { calls } = await signIn(page, { role: "Admin", frozen: true, proposal: true });
  await page.goto("/settings/scope3");
  const panel = page.getByTestId("recalculations");
  await expect(panel.getByText("Base year moved by +7.2 %, above your 5 % threshold, mostly Category 1.")).toBeVisible();
  await panel.getByRole("button", { name: "Approve recalculation" }).click();
  const dialog = page.getByRole("dialog", { name: "Approve the recalculation?" });
  await dialog.getByRole("textbox", { name: "Note" }).fill("abc");
  await dialog.getByRole("button", { name: "Approve recalculation" }).click();
  await expect(dialog.getByText("Write at least 5 characters.")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Note" }).fill("Invoice keyed twice");
  await dialog.getByRole("button", { name: "Approve recalculation" }).click();
  await expect(dialog).toBeHidden();
  expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ reason: "error", note: "Invoice keyed twice" });
  await expect(panel.getByText("Invoice keyed twice")).toBeVisible();
});

test("a manager reads the base year without edit controls", async ({ page }) => {
  await signIn(page, { role: "Manager", frozen: true });
  await page.goto("/settings/scope3");
  await expect(page.getByTestId("frozen-totals")).toContainText("2023");
  await expect(page.getByTestId("base-year").getByRole("button", { name: /Freeze base year|Save policy/ })).toHaveCount(0);
});

test("the targets page preselects the company base year", async ({ page }) => {
  await signIn(page, { role: "Manager", frozen: true });
  await page.goto("/targets");
  const select = page.getByRole("combobox", { name: "Base year" });
  await expect(select).toHaveValue("2023");
  await expect(page.getByText("Company base year 2023 (set in Scope 3 settings)")).toBeVisible();
});

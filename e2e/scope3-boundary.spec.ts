import { type Page, expect, test } from "@playwright/test";

/**
 * S3-1 Scope 3 boundary smoke tests. /scope3/* and the consolidation
 * approach answer from an in-memory company, so a reload shows what was
 * saved; every write is recorded.
 */

const NAMES = [
  "Purchased goods and services",
  "Capital goods",
  "Fuel- and energy-related activities",
  "Upstream transportation and distribution",
  "Waste generated in operations",
  "Business travel",
  "Employee commuting",
  "Upstream leased assets",
  "Downstream transportation and distribution",
  "Processing of sold products",
  "Use of sold products",
  "End-of-life treatment of sold products",
  "Downstream leased assets",
  "Franchises",
  "Investments",
];

type Row = { status: string; reason: string | null; method_note: string | null; updated_at: string | null; updated_by: { user_id: number; name: string } | null };

async function signIn(page: Page, role: "Admin" | "Superadmin" | "Manager", opts: { failBoundary?: boolean } = {}) {
  const rows: Record<number, Row> = {};
  NAMES.forEach((_, i) => {
    const n = i + 1;
    rows[n] =
      n >= 13
        ? { status: "not_relevant", reason: "No leased-out assets, franchises or investments", method_note: null, updated_at: null, updated_by: null }
        : { status: n === 6 ? "included" : "screening", reason: null, method_note: null, updated_at: null, updated_by: null };
  });
  let approach = "operational_control";
  let unmapped = [
    { category_id: 5, category_name: "FERA", ghg_category: null, proposed: 3, confidence: 95, basis: "legacy_map", confirmed: false },
    { category_id: 7, category_name: "Inbound freight", ghg_category: null, proposed: 4, confidence: 75, basis: "keyword", confirmed: false },
  ];
  const mapped: Record<number, { category_id: number; category_name: string }[]> = { 6: [{ category_id: 3, category_name: "Business Travel" }] };
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const user = { name: "Priya Admin", email: "priya@example.com" };

  await page.addInitScript(
    ([u, r]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
      if (r === "Superadmin") localStorage.setItem("esglite.clientId", "1");
    },
    [JSON.stringify(user), role] as const,
  );
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      if (method !== "GET") calls.push({ method, path, body });

      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/companies")) return json([
          { company_id: 1, name: "Midal Cables", status: true },
          { company_id: 2, name: "Glochem", status: true },
        ]);

      if (path.endsWith("/scope3/categories") && method === "GET") {
        if (opts.failBoundary) return json({ message: "Database unavailable" }, 500);
        const categories = NAMES.map((name, i) => ({
          n: i + 1,
          key: `k${i + 1}`,
          name,
          direction: i < 8 ? "upstream" : "downstream",
          methods: [],
          relevance: null,
          mapped_categories: mapped[i + 1] ?? [],
          ...rows[i + 1],
        }));
        const summary = { included: 0, excluded: 0, not_relevant: 0, screening: 0 } as Record<string, number>;
        categories.forEach((c) => summary[c.status]++);
        return json({
          company_id: 1,
          consolidation_approach: approach,
          summary,
          unmapped_count: unmapped.length,
          categories,
          can_edit: role !== "Manager",
          can_confirm_map: role === "Superadmin",
        });
      }
      const put = /\/scope3\/categories\/(\d+)$/.exec(path);
      if (put && method === "PUT") {
        const n = Number(put[1]);
        rows[n] = {
          status: String(body.status),
          reason: (body.reason as string | null) ?? null,
          method_note: (body.method_note as string | null) ?? null,
          updated_at: "2026-10-15T09:00:00Z",
          updated_by: { user_id: 3, name: user.name },
        };
        return json({ n, ...rows[n] });
      }
      if (path.endsWith("/scope3/category-map") && method === "GET") return json({ company_id: 1, unmapped, mapped: [] });
      if (path.endsWith("/scope3/category-map") && method === "POST") {
        for (const c of body.confirm as { category_id: number; ghg_category: number }[]) {
          const hit = unmapped.find((u) => u.category_id === c.category_id)!;
          unmapped = unmapped.filter((u) => u.category_id !== c.category_id);
          mapped[c.ghg_category] = [...(mapped[c.ghg_category] ?? []), { category_id: hit.category_id, category_name: hit.category_name }];
          if (rows[c.ghg_category].status === "screening") rows[c.ghg_category].status = "included";
        }
        return json({ confirmed: body.confirm });
      }
      if (/\/company\/1\/consolidation-approach$/.test(path) && method === "PUT") {
        approach = String(body.consolidation_approach);
        return json({ company_id: 1, consolidation_approach: approach });
      }
      return json({});
    },
  );
  return { calls };
}

const row = (page: Page, n: number) => page.getByTestId(`boundary-row-${n}`);

test("an admin excludes Category 14 with a reason, and it shows on reload", async ({ page }) => {
  const { calls } = await signIn(page, "Admin");
  await page.goto("/settings/scope3");
  await expect(page.getByRole("heading", { name: "Scope 3 boundary" })).toBeVisible();
  await expect(page.getByTestId("boundary-summary")).toHaveText("1 included · 0 excluded · 3 not relevant · 11 screening");

  await row(page, 14).getByRole("combobox", { name: "Status, Category 14" }).selectOption("excluded");
  const reason = row(page, 14).getByRole("textbox", { name: "Reason, Category 14" });
  await reason.fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Add a reason for 1 category before saving.")).toBeVisible();
  expect(calls).toHaveLength(0);

  await reason.fill("We have no franchises");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Scope 3 boundary saved (1 category)")).toBeVisible();
  expect(calls).toEqual([
    { method: "PUT", path: expect.stringMatching(/\/scope3\/categories\/14$/), body: { status: "excluded", reason: "We have no franchises", method_note: null } },
  ]);

  await page.reload();
  await expect(row(page, 14).getByRole("combobox", { name: "Status, Category 14" })).toHaveValue("excluded");
  await expect(row(page, 14).getByRole("textbox", { name: "Reason, Category 14" })).toHaveValue("We have no franchises");
  await expect(row(page, 14)).toContainText("by Priya Admin");
  await expect(page.getByTestId("boundary-summary")).toHaveText("1 included · 1 excluded · 2 not relevant · 11 screening");

  // Admins see the unmapped categories but a Superadmin confirms them.
  await expect(page.getByRole("heading", { name: /Unmapped categories/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm FERA" })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Consolidation approach" }).selectOption("equity_share");
  await expect(page.getByText("Consolidation approach set to equity share")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "PUT", path: expect.stringMatching(/\/company\/1\/consolidation-approach$/), body: { consolidation_approach: "equity_share" } });
});

test("a superadmin confirms the sure proposals and changes another's number", async ({ page }) => {
  const { calls } = await signIn(page, "Superadmin");
  await page.goto("/settings/scope3");
  await page.getByRole("button", { name: "Confirm all ≥ 90 % (1)" }).click();
  await expect(page.getByText("1 category confirmed")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "POST", body: { company_id: 1, confirm: [{ category_id: 5, ghg_category: 3 }] } });
  await expect(row(page, 3)).toContainText("FERA");

  await page.getByRole("button", { name: "Change number for Inbound freight" }).click();
  await page.getByRole("combobox", { name: "GHG Protocol category for Inbound freight" }).selectOption("9");
  await page.getByRole("button", { name: "Save number" }).click();
  await expect(row(page, 9)).toContainText("Inbound freight");
  await expect(page.getByRole("heading", { name: /Unmapped categories/ })).toHaveCount(0);
});

test("unsaved edits don't follow a superadmin to another client", async ({ page }) => {
  const { calls } = await signIn(page, "Superadmin");
  await page.goto("/settings/scope3");
  await row(page, 8).getByRole("combobox", { name: "Status, Category 8" }).selectOption("included");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();

  await page.getByRole("button", { name: /Client:/ }).click();
  await page.getByRole("option", { name: /Glochem/ }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await expect(row(page, 8).getByRole("combobox", { name: "Status, Category 8" })).toHaveValue("screening");
  expect(calls.filter((c) => c.method === "PUT")).toEqual([]);
});

test("a manager reads the boundary without edit controls", async ({ page }) => {
  await signIn(page, "Manager");
  await page.goto("/settings/scope3");
  await expect(page.getByText("You can read the boundary. An Admin or Superadmin changes it.")).toBeVisible();
  await expect(row(page, 14)).toContainText("Not relevant");
  await expect(page.getByRole("combobox", { name: "Status, Category 14" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Consolidation approach" })).toBeDisabled();
});

test("a failed load shows an error with Try again", async ({ page }) => {
  await signIn(page, "Admin", { failBoundary: true });
  await page.goto("/settings/scope3");
  await expect(page.getByText("Database unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" }).first()).toBeVisible();
});

for (const width of [1280, 1024, 768, 390]) {
  test(`fits ${width}px without horizontal page scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, "Admin");
    await page.goto("/settings/scope3");
    await expect(row(page, 1)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

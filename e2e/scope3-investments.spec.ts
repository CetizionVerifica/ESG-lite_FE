import { type Page, expect, test } from "@playwright/test";

/**
 * S3-11 investments register smoke test. /scope3/investments answers from an
 * in-memory list; the plan endpoint mirrors the engine for a 15.1 row
 * (investee Scope 1+2 × share of equity) so the preview shows the server's
 * total, never one the page worked out.
 */

type Inv = Record<string, unknown> & { id: number; investee: string; share_pct: number; investee_scope12_tco2e: number | null; year: number };

async function signIn(page: Page, role: "Admin" | "Manager") {
  const investments: Inv[] = [];
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  const user = { name: "Priya Admin", email: "priya@example.com" };
  const year = new Date().getFullYear();

  await page.addInitScript(
    ([u, r]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
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

      if (path.endsWith("/scope3/investments") && method === "GET") return json({ company_id: 1, can_edit: role === "Admin", investments });
      if (path.endsWith("/scope3/investments") && method === "POST") {
        const created = { id: investments.length + 1, company_id: 1, updated_at: null, ...body } as Inv;
        investments.push(created);
        return json(created, 201);
      }
      if (path.endsWith("/scope3/assets/sites"))
        return json({
          company_id: 1,
          consolidation_approach: "operational_control",
          can_edit: role === "Admin",
          sites: [{ site_id: 4, name: "Head office", lease_role: null, lease_type: null, floor_area_m2: null, boundary: null, note: null }],
        });
      if (path.endsWith("/scope3/investments/plan")) {
        const rows = investments
          .filter((i) => i.year === body.year && i.investee_scope12_tco2e !== null)
          .map((i) => ({
            row_ref: `investment-${i.id}`,
            state: "ready",
            issues: [],
            input: { activity_name: "Reported emissions [tCO2e]", activity_unit: "tCO2e" },
            result: { total_tco2e: ((i.investee_scope12_tco2e as number) * i.share_pct) / 100 },
          }));
        const total = rows.reduce((s, r) => s + r.result.total_tco2e, 0);
        return json(
          {
            plan: { plan_id: "plan-1", version: 1, status: "draft", counts: { rows: rows.length, ready: rows.length, issue: 0, skipped: 0, warnings: 0 }, totals: { tco2e: total }, rows },
            planned: investments.map((i) => ({ investment_id: i.id, row_refs: [`investment-${i.id}`], method: "investment_specific" })),
            skipped: [],
            threshold_pct: 0,
          },
          201,
        );
      }
      if (path.endsWith("/imports/plans/plan-1/commit"))
        return json({ plan_id: "plan-1", status: "committed", committed: { upload_batch_id: "b1", inserted: 1, committed_at: "2026-10-15T10:00:00Z" } });
      return json({});
    },
  );
  return { calls, year };
}

test("an admin adds a 25 % equity investment and the plan preview shows 15,000 tCO₂e", async ({ page }) => {
  const { calls, year } = await signIn(page, "Admin");
  await page.goto("/settings/scope3/investments");
  await expect(page.getByRole("heading", { name: "Investments" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Not relevant? Confirm it on Scope 3 boundary" })).toBeVisible();

  await page.getByRole("button", { name: "Add investment" }).first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("textbox", { name: "Investee", exact: true }).fill("Acme Power");
  await drawer.getByRole("textbox", { name: /Share of equity/ }).fill("25");
  await drawer.getByRole("textbox", { name: /Investee Scope 1\+2/ }).fill("60000");
  await drawer.getByRole("button", { name: "Add investment" }).click();
  await expect(page.getByText("Acme Power added")).toBeVisible();
  expect(calls[0]).toMatchObject({
    method: "POST",
    path: expect.stringMatching(/\/scope3\/investments$/),
    body: { investee: "Acme Power", type: "equity", share_pct: 25, investee_scope12_tco2e: 60000, year, revenue: null },
  });
  await expect(page.getByRole("cell", { name: "60,000 tCO₂e" })).toBeVisible();

  await page.getByRole("button", { name: "Create Category 15 plan" }).click();
  const plan = page.getByRole("dialog");
  await plan.getByRole("button", { name: "Preview plan" }).click();
  await expect(plan.getByTestId("plan-total")).toHaveText("15,000 tCO₂e");
  expect(calls.at(-1)).toMatchObject({ path: expect.stringMatching(/\/scope3\/investments\/plan$/), body: { site_id: 4, year, year_type: "CY" } });
  // The page sends no total: the server's plan carries it.
  expect(JSON.stringify(calls)).not.toContain("15000");

  await plan.getByRole("button", { name: "Import 1 row as Pending" }).click();
  await expect(page.getByText("1 row imported as Pending")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ path: expect.stringMatching(/\/imports\/plans\/plan-1\/commit$/), body: { version: 1, skip_rows_with_issues: true } });
});

test("a manager reads the register without edit controls", async ({ page }) => {
  await signIn(page, "Manager");
  await page.goto("/settings/scope3/investments");
  await expect(page.getByText("No investments yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add investment" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Category 15 plan" })).toHaveCount(0);
});

for (const width of [1280, 1024, 768, 390]) {
  test(`fits ${width}px without horizontal page scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, "Admin");
    await page.goto("/settings/scope3/investments");
    await expect(page.getByTestId("threshold-note")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

import { type Page, expect, test } from "@playwright/test";

/**
 * S3-9 commuting survey smoke test: upload the three-person sample from
 * guidance example 7.1, see rail 8,640 km and car 11,040 km by mode, create the
 * plan and import it. The plan endpoint answers like the server (one row per
 * mode, totals from the engine), so the page never sends a total of its own.
 */
const SAMPLE = ["Ref,Mode,One-way km,Days per week,Weeks per year", "A,Rail,10,5,48", "B,Rail,10,4,48", "B,Car,15,1,48", "C,Car,20,5,48"].join("\n");

async function signIn(page: Page) {
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  const user = { name: "Mona Manager", email: "mona@example.com" };
  await page.addInitScript(
    ([u]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", "Manager");
      localStorage.setItem("user", u);
    },
    [JSON.stringify(user)] as const,
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

      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });

      if (path.endsWith("/scope3/commuting/sites")) return json({ company_id: 1, sites: [{ site_id: 4, name: "Head office", category_id: 70 }] });
      if (path.endsWith("/scope3/commuting/surveys")) {
        // Rail 8,640 km × 0.1 and car 11,040 km × 0.2 (example 7.1), stored to 2 dp t.
        const rows = [
          { row_ref: "commuting-survey-CY2025-1", state: "ready", issues: [], input: { activity_name: "Rail [passenger.km]", activity_unit: "passenger.km" }, result: { total_tco2e: 0.86 } },
          { row_ref: "commuting-survey-CY2025-2", state: "ready", issues: [], input: { activity_name: "Car, unknown fuel [vehicle.km]", activity_unit: "vehicle.km" }, result: { total_tco2e: 2.21 } },
        ];
        return json(
          {
            plan: { plan_id: "plan-7", version: 1, status: "draft", counts: { rows: 2, ready: 2, issue: 0, skipped: 0, warnings: 0 }, totals: { tco2e: 3.07 }, rows },
            summary: {
              respondents: 3,
              total_employees: 3,
              scale: 1,
              coverage_pct: 100,
              modes: [
                { mode: "Rail [passenger.km]", matched: true, respondents: 2, total_km: 8640, unit: "passenger.km" },
                { mode: "Car, unknown fuel [vehicle.km]", matched: true, respondents: 2, total_km: 11040, unit: "vehicle.km" },
              ],
              skipped: [],
            },
          },
          201,
        );
      }
      if (path.endsWith("/imports/plans/plan-7/commit"))
        return json({ plan_id: "plan-7", status: "committed", committed: { upload_batch_id: "b7", inserted: 2, committed_at: "2026-10-15T10:00:00Z" } });
      return json({});
    },
  );
  return { calls };
}

test("a manager uploads the 7.1 sample, previews km by mode and imports the plan", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/settings/scope3/commuting?year=2025");
  await expect(page.getByRole("heading", { name: "Commuting survey" })).toBeVisible();

  await page.getByRole("textbox", { name: /Total employees/ }).fill("3");
  await page.locator('input[type="file"]').setInputFiles({ name: "survey.csv", mimeType: "text/csv", buffer: Buffer.from(SAMPLE) });

  const preview = page.getByTestId("mode-preview");
  await expect(preview.getByTestId("km-rail")).toHaveText("8,640 km");
  await expect(preview.getByTestId("km-car")).toHaveText("11,040 km");
  await expect(preview).toContainText("3 people in the survey, scaled × 1.0 to 3 employees");

  await page.getByRole("button", { name: "Create import plan" }).click();
  await expect(page.getByTestId("plan-total")).toHaveText("3.1 tCO₂e");
  expect(calls.at(-1)).toMatchObject({
    path: expect.stringMatching(/\/scope3\/commuting\/surveys$/),
    body: { site_id: 4, year: 2025, year_type: "CY", total_employees: 3 },
  });
  expect((calls.at(-1)?.body.responses as unknown[]).length).toBe(4);
  // The page sends answers, never a total.
  expect(JSON.stringify(calls)).not.toMatch(/total_tco2e|8640|11040/);

  await page.getByRole("button", { name: "Import 2 rows as Pending" }).click();
  await expect(page.getByText("2 rows imported as Pending")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ path: expect.stringMatching(/\/imports\/plans\/plan-7\/commit$/), body: { version: 1, skip_rows_with_issues: true } });
});

test("a sheet without the template's columns says which are missing", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/scope3/commuting");
  await page.locator('input[type="file"]').setInputFiles({ name: "survey.csv", mimeType: "text/csv", buffer: Buffer.from("Ref,Mode\nA,Rail") });
  await expect(page.getByText("Add One-way km, Days per week, Weeks per year, or start from the template.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create import plan" })).toHaveCount(0);
});

for (const width of [1280, 1024, 768, 390]) {
  test(`fits ${width}px without horizontal page scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    await page.goto("/settings/scope3/commuting");
    await page.locator('input[type="file"]').setInputFiles({ name: "survey.csv", mimeType: "text/csv", buffer: Buffer.from(SAMPLE) });
    await expect(page.getByTestId("mode-preview")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

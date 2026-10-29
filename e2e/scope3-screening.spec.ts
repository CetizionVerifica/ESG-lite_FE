import { type Page, expect, test } from "@playwright/test";

/**
 * S3-12 screening smoke test: enter a Category 6 spend figure, see the
 * server's estimate (labelled "Estimate, not saved"), tick "Stakeholders",
 * apply "Included"; and preview then create an extrapolated Pending row.
 * The mock answers like ESG-lite: the estimate comes from the server, the
 * page never sends a total.
 */

type Input = { ghg_category: number; basis: string; amount: number; currency?: string | null; eeio_sector?: string | null; note?: string | null };
type Row = { n: number; status: string; reason: string | null; relevance: Record<string, boolean> };

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

async function signIn(page: Page, role: "Admin" | "Manager") {
  const inputs: Input[] = [];
  const rows: Row[] = NAMES.map((_, i) => ({ n: i + 1, status: i === 0 ? "included" : "screening", reason: null, relevance: {} }));
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  const user = { name: "Priya Admin", email: "priya@example.com" };

  await page.addInitScript(
    ([u, r]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [JSON.stringify(user), role] as const,
  );

  // 1,200 USD × 0.5 kgCO₂e/USD = 0.6 tCO₂e, worked out by the "server".
  const estimateOf = (n: number) => {
    const i = inputs.find((x) => x.ghg_category === n && x.basis === "spend");
    return i ? Math.round(i.amount * 0.5) / 1000 : null;
  };
  const screening = (year: number) => {
    const sizes = rows.map((r) => (r.n === 1 ? 10 : estimateOf(r.n) ?? 0));
    const total = sizes.reduce((a, b) => a + b, 0);
    const categories = rows.map((r, i) => {
      const ticked = Object.keys(r.relevance).filter((k) => r.relevance[k]);
      const share = total ? Math.round((sizes[i] / total) * 1000) / 10 : 0;
      const estimate = estimateOf(r.n);
      return {
        n: r.n,
        key: `c${r.n}`,
        name: NAMES[i],
        direction: r.n <= 8 ? "upstream" : "downstream",
        status: r.status,
        reason: r.reason,
        relevance: r.relevance,
        recorded_tco2e: r.n === 1 ? 10 : 0,
        pending_tco2e: 0,
        proxy_tco2e: 0,
        estimate_tco2e: estimate,
        basis: estimate === null ? null : "spend",
        size_tco2e: sizes[i] || null,
        size_basis: estimate === null ? (r.n === 1 ? "recorded" : null) : "spend",
        share_pct: share,
        suggestion: ticked.length
          ? { status: "included", reason: `Relevant: ${ticked.join(", ")}` }
          : sizes[i]
            ? { status: "included", reason: `Estimated at ${share} % of Scope 3` }
            : { status: "not_relevant", reason: `No activity in this category in ${year}` },
        inputs: inputs
          .filter((x) => x.ghg_category === r.n)
          .map((x) => ({ ...x, updated_at: null, updated_by: null, estimate_tco2e: estimateOf(r.n), estimate_note: null, sector: x.eeio_sector ? { code: x.eeio_sector, name: "Air transportation (NAICS 481000)", factor_value: "0.5", price_base_year: year } : null, fx: null, warnings: [] })),
        mapped_categories: [],
      };
    });
    return {
      company_id: 1,
      year,
      year_type: "CY",
      period: { start: `${year}-01-01`, end: `${year}-12-31` },
      sites: [{ site_id: 1, name: "Jebel Ali plant", ghg_categories: [1, 6] }],
      totals: {
        recorded_tco2e: 10,
        pending_tco2e: 0,
        estimate_tco2e: categories.reduce((a, c) => a + (c.estimate_tco2e ?? 0), 0),
        screened_tco2e: total,
        included: rows.filter((r) => r.status === "included").length,
        with_reason: rows.filter((r) => r.status === "included" || r.reason).length,
      },
      categories,
      can_edit: role === "Admin",
      can_extrapolate: true,
    };
  };

  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      if (method !== "GET") calls.push({ method, path: `${path}${url.search}`, body });

      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });

      if (path.endsWith("/scope3/screening")) return json(screening(Number(url.searchParams.get("year"))));
      if (path.endsWith("/scope3/screening/inputs")) {
        for (const i of body.inputs as Input[]) {
          const at = inputs.findIndex((x) => x.ghg_category === i.ghg_category && x.basis === i.basis);
          if (at >= 0) inputs.splice(at, 1);
          inputs.push(i);
        }
        return json({ year: body.year, inputs });
      }
      if (path.endsWith("/scope3/spend/library"))
        return json({ factors: [{ emission_factor_id: 7, name: "Air transportation (NAICS 481000)", factor_value: "0.5", unit: "USD", price_base_year: 2025 }] });
      if (path.endsWith("/scope3/screening/sector-suggestions"))
        return json({ available: true, confirm_below: 80, suggestions: [{ code: "481000", name: "Air transportation (NAICS 481000)", confidence: 92, needs_confirmation: false }] });
      const put = /\/scope3\/categories\/(\d+)$/.exec(path);
      if (put && method === "PUT") {
        const r = rows.find((x) => x.n === Number(put[1]))!;
        Object.assign(r, { status: body.status, reason: body.reason ?? null, relevance: body.relevance ?? r.relevance });
        return json({ n: r.n, ...r });
      }
      if (path.endsWith("/scope3/extrapolate")) {
        const dry = url.searchParams.get("dry_run") === "1";
        const pct = body.coverage_pct as number;
        const kg = (850 * (100 - pct)) / pct;
        return json(
          {
            ...(dry ? { dry_run: true } : { id: 77, status: "pending" }),
            ghg_category: 6,
            site_id: 1,
            category_id: 3,
            year: body.year,
            year_type: "CY",
            basis: "coverage",
            basis_label: "Scaled up from the share of activity with data",
            method: "distance_based",
            formula: `850 kgCO₂e × (100 − ${pct}) ÷ ${pct} = ${kg} kgCO₂e`,
            total_kgco2e: kg.toFixed(4),
            total_tco2e: Math.round(kg / 10) / 100,
            proxy: { basis: "coverage", coverage_pct: pct, from: [5, 6] },
            sources: { rows: 2, kg: 850, site_ids: [1] },
          },
          dry ? 200 : 201,
        );
      }
      return json({});
    },
  );
  return { calls };
}

test("an admin enters Category 6 spend, sees the estimate, ticks Stakeholders and applies Included", async ({ page }) => {
  const { calls } = await signIn(page, "Admin");
  await page.goto("/settings/scope3/screening?year=2025");
  await expect(page.getByRole("heading", { name: "Scope 3 screening" })).toBeVisible();
  const row6 = page.getByTestId("screening-row-6");
  await expect(row6).toContainText("Add a spend figure to estimate this category");

  await row6.getByRole("button", { name: "Inputs and extrapolation for Category 6" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("textbox", { name: "Amount" }).fill("1200");
  await drawer.getByRole("textbox", { name: "What was bought" }).fill("Flights to Mumbai");
  await drawer.getByRole("button", { name: "Suggest sector" }).click();
  await drawer.getByRole("button", { name: "Air transportation (NAICS 481000)" }).click();
  await drawer.getByRole("button", { name: "Save figure" }).click();
  await expect(page.getByText("Amount spent saved for Category 6 · Business travel")).toBeVisible();
  expect(calls.find((c) => c.path.endsWith("/scope3/screening/inputs"))?.body).toEqual({
    year: 2025,
    year_type: "CY",
    inputs: [{ ghg_category: 6, basis: "spend", amount: 1200, currency: "USD", eeio_sector: "481000", note: null }],
  });
  // The page sends no total: the estimate is the server's.
  expect(JSON.stringify(calls)).not.toContain("0.6");
  await drawer.getByRole("button", { name: "Close" }).first().click();

  await expect(row6).toContainText("0.600 tCO₂e");
  await expect(row6).toContainText("Estimate, not saved");

  await row6.getByRole("checkbox", { name: "Stakeholders" }).check();
  await expect.poll(() => calls.some((c) => c.path.endsWith("/scope3/categories/6") && (c.body.relevance as Record<string, boolean>)?.stakeholders === true)).toBe(true);
  await expect(row6).toContainText("Relevant: stakeholders");

  await row6.getByRole("button", { name: "Apply the suggestion for Category 6" }).click();
  const apply = page.getByRole("dialog");
  await expect(apply.getByRole("combobox", { name: "Status" })).toHaveValue("included");
  await apply.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Category 6 · Business travel set to included")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "PUT", path: expect.stringMatching(/\/scope3\/categories\/6$/), body: { status: "included", relevance: { stakeholders: true } } });
  await expect(row6.getByText("Included").last()).toBeVisible();
});

test("extrapolate shows the formula before it creates a Pending row", async ({ page }) => {
  const { calls } = await signIn(page, "Admin");
  await page.goto("/settings/scope3/screening?year=2025");
  await page.getByTestId("screening-row-6").getByRole("button", { name: "Inputs and extrapolation for Category 6" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Extrapolate…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /Share your recorded rows cover/ }).fill("85");
  await dialog.getByRole("button", { name: "Show the calculation" }).click();
  await expect(dialog.getByTestId("extrapolation-preview")).toContainText("850 kgCO₂e × (100 − 85) ÷ 85 = 150 kgCO₂e");
  expect(calls.at(-1)?.path).toMatch(/\/scope3\/extrapolate\?dry_run=1$/);
  await dialog.getByRole("button", { name: "Create Pending row" }).click();
  await expect(page.getByText("Extrapolated row of 0.150 tCO₂e added as Pending")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ path: expect.stringMatching(/\/scope3\/extrapolate$/), body: { ghg_category: 6, site_id: 1, year: 2025, year_type: "CY", basis: "coverage", coverage_pct: 85 } });
});

test("a manager reads the screening without edit controls", async ({ page }) => {
  await signIn(page, "Manager");
  await page.goto("/settings/scope3/screening?year=2025");
  await expect(page.getByText("You can read the screening.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Apply the suggestion/ })).toHaveCount(0);
  await expect(page.getByTestId("screening-row-6").getByRole("checkbox", { name: "Stakeholders" })).toBeDisabled();
});

for (const width of [1280, 1024, 768, 390]) {
  test(`fits ${width}px without horizontal page scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, "Admin");
    await page.goto("/settings/scope3/screening?year=2025");
    await expect(page.getByRole("heading", { name: "Scope 3 screening" })).toBeVisible();
    await expect(page.getByTestId(width < 768 ? "screening-card-6" : "screening-row-6")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

import { type Page, expect, test } from "@playwright/test";

/**
 * C05 Declaration export smoke tests (VITE_NEW_UI=1 server).
 * /pcf/studies/:id/export answers from fixtures: study 21 is approved and
 * uses a licensed factor, 22 is a draft, 23 is not calculated.
 */

function declaration(status: string, draft: boolean) {
  return {
    pact_id: "0b8f7c34-6a1e-5c7b-9d2f-1a2b3c4d5e6f",
    draft,
    status,
    version: 2,
    company: { name: "Midal Cables" },
    product: { name: "EC-grade wire rod 9.5 mm", description: null },
    site: { name: "Bahrain plant", country: "Bahrain" },
    declared_unit: { quantity: 1, unit: "kg", label: "1 kg" },
    reference_period: { start: "2024-01-01", end: "2024-12-31", year_type: "CY" },
    method: { standard: "ISO14067", boundary: "cradle_to_gate", pcr: "EN 50693", allocation_key: "mass", allocation_share_pct: 40, cut_off_rule_pct: 1, gwp_sets: ["AR6"] },
    total_kg_per_unit: 9.1025,
    by_stage: { A1: 8.6, A2: 0, A3_energy: 0.2025, A3_packaging: null, A3_waste: 0 },
    hidden_stages: ["A3_packaging"],
    lines: [
      { id: "in-1", stage: "A1", name: "Aluminium ingot", data_type: "secondary", kgco2e_per_unit: 8.6, value_hidden: false },
      { id: "in-2", stage: "A3_packaging", name: "Wrap film", data_type: "secondary", kgco2e_per_unit: null, value_hidden: true },
      { id: "e-1", stage: "A3_energy", name: "Purchased electricity", data_type: "primary", kgco2e_per_unit: 0.2025, value_hidden: false },
    ],
    primary_data_share_pct: null,
    dqr: null,
    cut_off: { below_threshold_total_pct: null, within_limit: true },
    licensed_values_withheld: true,
    factor_sources: [{ name: "IAI", version: "2023" }],
    warnings: [],
    reviewed_by: "Sam Staff",
    reviewed_at: "2025-02-01T10:00:00.000Z",
    calculated_at: "2025-01-20T10:00:00.000Z",
    generated_at: "2025-03-01T10:00:00.000Z",
    engine_version: "pcf-1.0.0",
  };
}

async function signIn(page: Page) {
  const exports: string[] = [];
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", u);
  }, JSON.stringify({ name: "Maya Manager", email: "maya@example.com" }));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (path.endsWith("/auth/me")) return json({ role: "Manager", user: { name: "Maya Manager" } });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      const m = /\/pcf\/studies\/(\d+)\/export$/.exec(path);
      if (m) {
        const id = Number(m[1]);
        const format = url.searchParams.get("format");
        exports.push(`${id}:${format}`);
        if (id === 23) return json({ message: "Calculate the footprint first" }, 409);
        const d = id === 21 ? declaration("approved", false) : declaration("draft", true);
        if (format === "pdf-data") return json({ declaration: d, file_name: "EC-grade-wire-rod-9-5-mm-21-v2.pdf" });
        if (format === "pact") {
          return route.fulfill({
            status: 200,
            headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="EC-grade-wire-rod-9-5-mm-21-v2.pact.json"' },
            body: JSON.stringify({ id: d.pact_id, specVersion: "3.0.3" }),
          });
        }
        if (format === "csv") {
          return route.fulfill({
            status: 200,
            headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="EC-grade-wire-rod-9-5-mm-21-v2.csv"' },
            body: '"Company","Midal Cables"\r\n',
          });
        }
      }
      return json({});
    },
  );
  return { exports };
}

test("an approved footprint downloads as PDF, PACT JSON and CSV", async ({ page }) => {
  const { exports } = await signIn(page);
  await page.goto("/products/21/export");
  await expect(page.getByRole("heading", { name: "Export declaration" })).toBeVisible();
  await expect(page.getByTestId("declaration-total")).toHaveText("9.10");
  await expect(page.getByText("Licensed values are withheld.")).toBeVisible();
  await expect(page.getByText("This footprint isn't approved yet.")).toHaveCount(0);
  const stages = page.getByRole("region", { name: "Declaration summary" });
  await expect(stages.getByRole("listitem").filter({ hasText: "Packaging" })).toContainText("Withheld");

  const pact = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PACT JSON" }).click();
  expect((await pact).suggestedFilename()).toBe("EC-grade-wire-rod-9-5-mm-21-v2.pact.json");

  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect((await csv).suggestedFilename()).toBe("EC-grade-wire-rod-9-5-mm-21-v2.csv");

  const pdf = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Download PDF" }).click();
  expect((await pdf).suggestedFilename()).toBe("EC-grade-wire-rod-9-5-mm-21-v2.pdf");
  await expect(page.getByText("PDF declaration downloaded.")).toBeVisible();
  expect(exports).toEqual(expect.arrayContaining(["21:pdf-data", "21:pact", "21:csv"]));
});

test("a draft is marked and can't go out as PACT; an uncalculated one says what to do", async ({ page }) => {
  await signIn(page);
  await page.goto("/products/22/export");
  await expect(page.getByText("This footprint isn't approved yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PACT JSON" })).toBeDisabled();
  await expect(page.getByText("Available once the footprint is approved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeEnabled();

  await page.goto("/products/23/export");
  await expect(page.getByText("Calculate the footprint first")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the footprint" })).toHaveAttribute("href", "/products/23");
});

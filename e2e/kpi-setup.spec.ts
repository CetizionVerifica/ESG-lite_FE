import { type Page, expect, test } from "@playwright/test";
import { OMAR, kpiApp } from "./kpiMockApi";

/**
 * KPI-3 · The Admin setup wizard (05-ux S2) against the stateful KPI mocks:
 * ACME just switched on, nothing chosen yet.
 */

const next = (page: Page) => page.getByRole("button", { name: /^Next|^Finish setup/ });
const puts = (calls: { method: string; path: string; body: unknown }[]) => calls.filter((c) => c.method === "PUT" && c.path.endsWith("/kpi/setup")).map((c) => c.body as Record<string, unknown>);

async function answerTopics(page: Page) {
  for (const t of ["E2 Pollution", "E3 Water and marine resources", "E5 Resource use and circular economy", "S1 Own workforce", "S2 Workers in the value chain", "S3 Affected communities", "S4 Consumers and end-users", "G1 Business conduct"]) {
    await page.getByRole("radiogroup", { name: `Does ${t} matter to you?` }).getByRole("radio", { name: "Yes" }).click();
  }
  await page.getByRole("radiogroup", { name: "Does E4 Biodiversity and ecosystems matter to you?" }).getByRole("radio", { name: "No" }).click();
}

test("an admin sets up KPIs in four steps: frameworks, topics, KPIs with a reason and their own KPI, then owners", async ({ page }) => {
  const calls = await kpiApp(page, { role: "Admin", user: OMAR, freshSetup: true });
  await page.goto("/kpi/setup");
  await expect(page.getByRole("heading", { name: "KPI setup", level: 1 })).toBeVisible();

  // Step 1: GRI is recommended and pre-ticked; add BRSR and CSRD (ESRS).
  const gri = page.getByRole("checkbox", { name: /^GRI/ });
  await expect(gri).toHaveAttribute("aria-checked", "true");
  await expect(gri).toContainText("Recommended for you");
  await page.getByRole("checkbox", { name: /^BRSR/ }).click();
  await page.getByRole("checkbox", { name: /^CSRD \(ESRS\)/ }).click();
  await expect(next(page)).toHaveText(/Next: what matters to you/);
  await next(page).click();
  await expect(page.getByRole("radiogroup", { name: "Does E1 Climate change matter to you?" })).toBeVisible();
  expect(puts(calls)[0]).toMatchObject({ framework_ids: [1, 2, 3], settings: { year_type: "CY", due_day: 15 } });

  // Step 2: climate starts at Yes; "No" needs a reason.
  await expect(page.getByRole("radiogroup", { name: "Does E1 Climate change matter to you?" }).getByRole("radio", { name: "Yes" })).toHaveAttribute("aria-checked", "true");
  await next(page).click();
  await expect(page.getByText("Answer every topic. A topic that doesn't matter needs a one-line reason.")).toBeVisible();
  await answerTopics(page);
  await next(page).click();
  await expect(page.getByText("Say in one line why it doesn't matter. ESRS asks for it.")).toBeVisible();
  await page.getByLabel("Why doesn't it matter?").fill("No site is in or next to a protected area.");
  await next(page).click();
  await expect(page.getByTestId("kpi-count")).toBeVisible();
  expect(puts(calls)[1].material_topics).toContainEqual({ esrs_topic: "E4", material: false, reason: "No site is in or next to a protected area." });

  // Step 3: pre-ticked with what the frameworks require, with a live count.
  await expect(page.getByTestId("kpi-count")).toContainText("KPIs selected");
  const count = async () => Number((await page.getByTestId("kpi-count").locator("b").first().textContent()) ?? 0);
  const before = await count();
  const discharge = page.getByRole("checkbox", { name: "Water discharged" });
  await expect(discharge).toHaveAttribute("aria-checked", "true");
  await discharge.click();
  const prompt = page.getByRole("dialog", { name: "Leave out Water discharged?" });
  await expect(prompt).toContainText("Required by GRI 303-4, BRSR P6-E4, ESRS E3-4.");
  await expect(prompt.getByRole("button", { name: "Leave it out" })).toBeDisabled();
  await prompt.getByLabel("Reason").fill("Zero liquid discharge at every plant");
  await prompt.getByRole("button", { name: "Leave it out" }).click();
  await expect(discharge).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("setup-kpi-row").filter({ hasText: "Water discharged" })).toContainText("Zero liquid discharge at every plant");
  expect(await count()).toBe(before - 1);

  // Add your own KPI, with a suggested mapping.
  await page.getByRole("button", { name: "Add your own KPI" }).click();
  const own = page.getByRole("dialog", { name: "Add your own KPI" });
  await own.getByLabel("Name").fill("Rainwater harvested");
  await own.getByLabel("Question your people answer").fill("How much rainwater did {site} collect in {period}?");
  await own.getByLabel("Unit").fill("m³");
  await own.getByRole("button", { name: "Suggest" }).click();
  await own.getByRole("checkbox", { name: /GRI 303-3/ }).check();
  await own.getByRole("button", { name: "Add KPI" }).click();
  await expect(page.getByText("Rainwater harvested added and ticked.")).toBeVisible();
  const rain = page.getByTestId("setup-kpi-row").filter({ hasText: "Rainwater harvested" });
  await expect(rain).toContainText("Your own");
  await expect(rain.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  const custom = calls.find((c) => c.path.endsWith("/kpi/setup/custom-kpis"));
  expect(custom?.body).toMatchObject({ name: "Rainwater harvested", canonical_unit: "m³", unit_dimension: "volume", allowed_units: expect.arrayContaining(["m³", "kL"]), mappings: [{ fit: "partial" }] });
  expect(await count()).toBe(before);

  await next(page).click();
  await expect(page.getByRole("table", { name: "Who enters each site KPI" })).toBeVisible();
  const kpis = puts(calls)[2].kpis as { kpi_definition_id: number; selected: boolean; reason_excluded: string | null }[];
  expect(kpis).toContainEqual({ kpi_definition_id: 14, selected: false, frequency: null, reason_excluded: "Zero liquid discharge at every plant" });
  expect(kpis.filter((k) => k.selected).length).toBe(before);

  // Step 4: owners default to each site's data-entry user; apply one person to every site.
  const cell = (kpi: string, site: string) => page.getByRole("combobox", { name: `${kpi} at ${site}` });
  await expect(cell("Water withdrawn", "Bahrain plant")).toHaveValue("Ravi Kumar (User)");
  await expect(cell("Water withdrawn", "Dammam")).toHaveValue("Sara Ali (User)");
  await cell("Water withdrawn", "Bahrain plant").click();
  await cell("Water withdrawn", "Bahrain plant").fill("Mia");
  await page.getByRole("option", { name: "Mia Haddad (Manager)" }).click();
  await page.getByRole("button", { name: "Apply Water withdrawn's first person to all sites" }).click();
  await expect(page.getByText("Applied to all sites.")).toBeVisible();
  await expect(cell("Water withdrawn", "Matola")).toHaveValue("Mia Haddad (Manager)");
  await expect(page.getByRole("combobox", { name: "Revenue for the company" })).toHaveValue("Omar Saleh (Admin)");

  await next(page).click();

  // Finished: summary and "Invite your team".
  await expect(page.getByRole("heading", { name: "KPI setup is done" })).toBeVisible();
  const last = puts(calls)[3];
  expect(last.settings).toEqual({ complete: true });
  expect(last.assignments).toContainEqual({ kpi_definition_id: 13, site_id: 3, owner_user_id: 12, reviewer_user_id: null });
  await page.getByRole("button", { name: "Invite your team to enter KPIs" }).click();
  await expect(page.getByText(/people were told what they enter\./)).toBeVisible();
  expect(calls.some((c) => c.path.endsWith("/kpi/setup/invite"))).toBe(true);

  // Later changes: the same steps as tabs.
  await page.getByRole("button", { name: "Change setup" }).click();
  await expect(page.getByRole("tab", { name: "Who enters what" })).toBeVisible();
});

test("the wizard resumes where it was left after a reload", async ({ page }) => {
  await kpiApp(page, { role: "Admin", user: OMAR, freshSetup: true });
  await page.goto("/kpi/setup");
  await page.getByRole("checkbox", { name: /^CSRD \(ESRS\)/ }).click();
  await next(page).click();
  await expect(page.getByRole("radiogroup", { name: "Does E1 Climate change matter to you?" })).toBeVisible();
  await page.goto("/kpi/setup");
  await expect(page.getByRole("radiogroup", { name: "Does E1 Climate change matter to you?" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "KPI setup steps" }).getByRole("listitem").nth(1)).toHaveAttribute("aria-current", "step");
});

test("without ESRS the topics step is skipped, and at 390 px nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await kpiApp(page, { role: "Admin", user: OMAR, freshSetup: true });
  await page.goto("/kpi/setup");
  await expect(page.getByText("Step 1 of 4: Frameworks")).toBeVisible();
  await expect(next(page)).toHaveText(/Next: kpis/);
  await next(page).click();
  await expect(page.getByText("Step 3 of 4: KPIs")).toBeVisible();
  await expect(page.getByTestId("kpi-count")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await next(page).click();
  await expect(page.getByRole("combobox", { name: "Water withdrawn at Bahrain plant" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("a finished setup opens as tabs and saves one part at a time", async ({ page }) => {
  const calls = await kpiApp(page, { role: "Admin", user: OMAR });
  await page.goto("/kpi/setup?step=kpis");
  await expect(page.getByRole("tab", { name: "KPIs" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("checkbox", { name: "Particulate matter emitted" }).click();
  await page.getByRole("tabpanel").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("KPIs saved.")).toBeVisible();
  const body = puts(calls)[0].kpis as { kpi_definition_id: number; selected: boolean }[];
  expect(body).toContainEqual(expect.objectContaining({ kpi_definition_id: 20, selected: true }));
});

test("with the switch off, KPI setup is not available and not in the nav", async ({ page }) => {
  await kpiApp(page, { role: "Admin", user: OMAR, enabled: false });
  await page.goto("/kpi/setup");
  await expect(page.getByText("KPI tracking isn't turned on for your company.")).toBeVisible();
  await expect(page.getByRole("link", { name: "KPI setup" })).toHaveCount(0);
});

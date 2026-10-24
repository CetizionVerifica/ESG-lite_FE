import { type Page, expect, test } from "@playwright/test";
import { type Call, SAM, kpiApp } from "./kpiMockApi";

/**
 * D18 · A Superadmin can do everything an Admin can for KPIs, for the client
 * chosen in the client context, passing `company_id`. Sam (ESGLite staff)
 * walks ACME's setup, topic owners, a target, the review and period close,
 * a dashboard reminder and a report download. Without a client every KPI
 * page asks for one.
 */

const app = (page: Page, opts: { clientId?: number; enabled?: boolean } = {}) => kpiApp(page, { role: "Superadmin", user: SAM, ...opts });
const kpiWrites = (calls: Call[]) => calls.filter((c) => /\/kpi(\/|$)/.test(c.path));

test("without a client, each KPI page asks for one; picking ACME opens it", async ({ page }) => {
  await app(page);
  for (const path of ["/kpi/dashboard", "/kpi/setup", "/kpi/targets", "/data/approvals?view=kpi", "/reports/kpi/GRI"]) {
    await page.goto(path);
    await expect(page.getByTestId("kpi-choose-client")).toContainText("Choose a client to see its KPIs");
  }
  // The nav offers the KPI pages already, so they can be found before a client is picked.
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "KPIs", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Targets" })).toBeVisible();
  await page.keyboard.press("Escape");

  const choose = page.getByTestId("kpi-choose-client");
  await choose.getByRole("button", { name: /Choose client/ }).click();
  await page.getByRole("option", { name: "ACME" }).click();
  await expect(page.getByRole("heading", { name: "Framework reports", level: 1 })).toBeVisible();
  await expect(page.getByTestId("kpi-choose-client")).toHaveCount(0);
});

test("with ACME chosen: setup and topic owners, a target, review and close, remind, and a report download", async ({ page }) => {
  const calls = await app(page, { clientId: 1 });

  // Setup → Who enters what: give Water at Dammam to Mia.
  await page.goto("/kpi/setup?step=owners");
  await expect(page.getByRole("heading", { name: "KPI setup", level: 1 })).toBeVisible();
  const water = page.getByRole("combobox", { name: "Water at Dammam" });
  await expect(water).toHaveValue("Sara Ali (User)");
  await water.click();
  await water.fill("Mia");
  await page.getByRole("option", { name: "Mia Haddad (Manager)" }).click();
  await page.getByRole("tabpanel", { name: /Who enters what/ }).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Owners saved.")).toBeVisible();
  const setupPut = calls.find((c) => c.method === "PUT" && c.path.endsWith("/kpi/setup"));
  expect(setupPut?.search).toContain("company_id=1");
  expect((setupPut?.body as { topic_assignments: unknown[] }).topic_assignments).toContainEqual({ site_id: 2, topic: "water", owner_user_id: 12, reviewer_user_id: null });

  // Targets: set one.
  await page.goto("/kpi/targets");
  await page.getByRole("button", { name: "Set a target" }).click();
  const drawer = page.getByRole("dialog", { name: "Set a target" });
  await drawer.getByRole("combobox", { name: "KPI" }).fill("Waste gen");
  await page.getByRole("option", { name: "Waste generated" }).click();
  await drawer.getByLabel("Baseline year").selectOption("2025");
  await drawer.getByLabel("Target value").fill("82.9");
  await drawer.getByRole("button", { name: "Set target" }).click();
  await expect(page.getByText("Target set for Waste generated")).toBeVisible();

  // Approvals → KPIs: approve what's ready, then close August.
  await page.goto("/data/approvals?view=kpi");
  await expect(page.getByRole("heading", { name: "Approvals", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: /KPIs/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Ledger/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Approve all 5 ready" }).click();
  await expect(page.getByText("Approved 5 values.")).toBeVisible();
  await expect.poll(() => calls.filter((c) => c.path.endsWith("/kpi/values/approve")).length, { timeout: 15_000 }).toBe(1);
  await page.goto("/data/approvals?view=kpi&step=close&period=2026-08");
  await page.getByRole("button", { name: "Lock August 2026 for 3 sites" }).click();
  await expect(page.getByText("August 2026 is locked")).toBeVisible();
  await page.getByTestId("kpi-close-site").filter({ hasText: "Dammam" }).getByRole("button", { name: "Reopen" }).click();
  const reopen = page.getByRole("dialog", { name: "Reopen August 2026 for Dammam?" });
  await reopen.getByLabel("Reason").fill("Meter reading corrected");
  await reopen.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText("August 2026 is open again for Dammam")).toBeVisible();

  // Dashboard: remind an owner.
  await page.goto("/kpi/dashboard");
  const gap = page.getByTestId("kpi-gap").filter({ hasText: "Water discharged" });
  await gap.getByRole("button", { name: "Remind João Mendes about Water discharged at Matola" }).click();
  await expect(page.getByText("Reminder sent to João Mendes")).toBeVisible();

  // Framework reports: download.
  await page.goto("/reports/kpi/GRI");
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download XLSX" }).click()]);
  expect(xlsx.suggestedFilename()).toBe("GRI-2026.xlsx");

  // Every KPI write went for ACME.
  const writes = kpiWrites(calls);
  expect(writes.length).toBeGreaterThanOrEqual(6);
  for (const w of writes) expect(w.search, `${w.method} ${w.path}`).toContain("company_id=1");
});

test("a Superadmin's palette offers the KPI pages for the chosen client", async ({ page }) => {
  await app(page, { clientId: 1 });
  await page.goto("/kpi/dashboard");
  await expect(page.getByRole("heading", { name: "KPIs", level: 1 })).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search pages" }).fill("kpi");
  for (const name of ["KPI dashboard", "KPI targets", "KPI approvals", "KPI setup"]) await expect(page.getByRole("option", { name: new RegExp(name) })).toBeVisible();
  await page.getByRole("combobox", { name: "Search pages" }).fill("kpi targets");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/kpi\/targets$/);
});

test("with the client's switch off, the KPI pages say so and the nav has no KPIs", async ({ page }) => {
  await app(page, { clientId: 1, enabled: false });
  await page.goto("/data/approvals?view=kpi");
  await expect(page.getByText("KPI tracking isn't turned on for this client.")).toBeVisible();
  await page.goto("/kpi/targets");
  await expect(page.getByText("KPI tracking isn't turned on for this client.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "KPIs", exact: true })).toHaveCount(0);
});

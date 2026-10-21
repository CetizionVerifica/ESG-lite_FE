import { type Page, expect, test } from "@playwright/test";
import { type Call, mockInsightsApi, managerAt } from "./insightsMockApi";

/**
 * IN-0 · The Insights switch, nav, deep links and the page shell on mocks
 * (in-memory API: e2e/insightsMockApi.ts).
 */

const PATHWAY_EMPTY = { pathway: { availability: "no_data" as const, reason: "Set an SBTi base year to see your pathway." } };
const mockApi = (page: Page, role: string, user: object, opts: Parameters<typeof mockInsightsApi>[3] = {}) => mockInsightsApi(page, role, user, { panels: PATHWAY_EMPTY, ...opts });

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET" && c.method !== "OPTIONS");
const SLOT_IDS = ["stripes", "hero", "decoupling", "pathway", "wall", "cards"];

test("with the switch off, a manager has no Insights item or link, and /insights says it isn't turned on", async ({ page }) => {
  await mockApi(page, "Manager", managerAt(false), { insights: false });
  await page.goto("/settings");
  await expect(mainNav(page).getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(mainNav(page).getByRole("link", { name: "Insights" })).toHaveCount(0);

  await page.goto("/insights?year=2025");
  await expect(page.getByText("Insights isn't turned on for your company.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to your home page" })).toHaveAttribute("href", "/overview");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search pages" }).fill("insights");
  await expect(page.getByRole("option", { name: /Insights/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/overview");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("see-insights")).toHaveCount(0);
});

test("with the switch on, Insights is the manager's second nav item and the page renders every slot on mocks (1280)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/overview");
  await expect(page.getByTestId("see-insights")).toHaveAttribute("href", "/insights");
  const links = mainNav(page).getByRole("link");
  await expect(links.nth(0)).toHaveText("Overview");
  await expect(links.nth(1)).toHaveText("Insights");
  await links.nth(1).click();
  await expect(page).toHaveURL(/\/insights$/);
  await expect(page.getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();

  for (const id of [...SLOT_IDS, "ring", "flow"]) await expect(page.getByTestId(`panel-${id}`), id).toBeVisible();
  await expect(page.getByTestId("panel-decoupling")).toHaveAttribute("data-state", "ok");
  await expect(page.getByTestId("panel-pathway")).toHaveAttribute("data-state", "empty");
  await expect(page.getByTestId("panel-pathway")).toContainText("Set an SBTi base year to see your pathway.");
  // Lazy tabs: only the open one has loaded.
  await expect(page.getByRole("tab", { name: "Materiality" })).toBeVisible();
  await expect(page.getByTestId("panel-materiality")).toHaveCount(0);
  await page.getByRole("tab", { name: "Materiality" }).click();
  await expect(page.getByTestId("panel-materiality")).toBeVisible();

  // Filters live in the URL.
  await page.getByRole("group", { name: "Pillar" }).getByRole("button", { name: "Social" }).click();
  await expect(page).toHaveURL(/pillar=social/);
  await page.getByRole("radiogroup", { name: "Compare with" }).getByRole("radio", { name: "Base year" }).click();
  await expect(page).toHaveURL(/compare=base/);
  await page.getByRole("group", { name: "Sites" }).getByRole("button", { name: "Pune plant" }).click();
  await expect(page).toHaveURL(/sites=13/);
  await expect(page.getByRole("button", { name: "Present" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export" })).toBeDisabled();
});

test("KPI tracking off: the ring and the Materiality tab are hidden, not empty, and there are no pillar chips", async ({ page }) => {
  await mockApi(page, "Manager", managerAt(true), { insights: true, kpi: false });
  await page.goto("/insights");
  await expect(page.getByTestId("panel-decoupling")).toHaveAttribute("data-state", "ok");
  await expect(page.getByTestId("panel-ring")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Materiality" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Pillar" })).toHaveCount(0);
  await expect(page.getByText(/KPI tracking/)).toHaveCount(0);
});

test("at 390 px every slot stacks and the tabs become a select", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights");
  for (const id of SLOT_IDS) await expect(page.getByTestId(`panel-${id}`), id).toBeAttached();
  await expect(page.getByRole("combobox", { name: "More detail" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the server's switch wins over the session: turned off since sign-in hides the item and the page", async ({ page }) => {
  await mockApi(page, "Manager", managerAt(true), { insights: true, serverOff: true });
  await page.goto("/insights");
  await expect(page.getByText("Insights isn't turned on for your company.")).toBeVisible();
  await expect(mainNav(page).getByRole("link", { name: "Insights" })).toHaveCount(0);
});

test("a user never sees Insights, even with the switch on", async ({ page }) => {
  const user = { user_id: 11, name: "Ravi Kumar", email: "ravi@acme.example", site: { site_id: 11, name: "Chennai plant", company: { company_id: 1, insights_enabled: true } } };
  await mockApi(page, "User", user, { insights: true });
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await expect(mainNav(page).getByText("Insights")).toHaveCount(0);
});

test("a superadmin turns Insights on (the nav item appears) and confirms before turning it off", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls = await mockApi(page, "Superadmin", { name: "Sam Staff", email: "sam@example.com" });
  await page.goto("/clients/1");
  const toggle = page.getByRole("switch", { name: "Insights" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Off. ACME's people don't see Insights.")).toBeVisible();
  const reports = async () => {
    await mainNav(page).getByRole("button", { name: "Reports" }).click();
    const menu = page.getByRole("menu");
    return menu;
  };
  let menu = await reports();
  await expect(menu.getByRole("menuitem", { name: "Insights" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await toggle.click();
  await expect(page.getByText("Insights is on for ACME. Their Managers and Admins will see it under Overview.")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("On. ACME sees emissions and targets. ESG panels also need KPI tracking.")).toBeVisible();
  expect(writes(calls)).toContainEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/companies\/1$/), body: { insights_enabled: true } });
  menu = await reports();
  await expect(menu.getByRole("menuitem", { name: "Insights" })).toBeVisible();
  await page.keyboard.press("Escape");

  const before = writes(calls).length;
  await toggle.click();
  const confirm = page.getByRole("group", { name: /Hide Insights for ACME\?/ });
  await expect(confirm).toBeFocused();
  await confirm.getByRole("button", { name: "Keep it on" }).click();
  await expect(confirm).toHaveCount(0);
  expect(writes(calls)).toHaveLength(before);

  await toggle.click();
  await page.getByRole("button", { name: "Hide Insights" }).click();
  await expect(page.getByText("Insights is off for ACME. Their timeline events are kept.")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(writes(calls).at(-1)).toEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/companies\/1$/), body: { insights_enabled: false } });
});

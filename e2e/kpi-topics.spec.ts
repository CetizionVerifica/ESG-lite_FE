import { type Page, expect, test } from "@playwright/test";
import { OMAR, kpiApp } from "./kpiMockApi";

/**
 * D17 · The company users drawer's "KPI topics" field: the topics a person
 * enters KPIs for, saved with the drawer (`PUT /kpi/people/:id/topics`);
 * slots that change hands show as "moved from" notes. Hidden while the
 * company's KPI switch is off.
 */

const SITES = [
  { site_id: 1, name: "Bahrain plant" },
  { site_id: 2, name: "Dammam" },
  { site_id: 3, name: "Matola" },
];
const PEOPLE = [
  { user_id: 11, name: "Ravi Kumar", email: "ravi@acme.example", role: "User", site: SITES[0], sites: [SITES[0]] },
  { user_id: 14, name: "Sara Ali", email: "sara@acme.example", role: "User", site: SITES[1], sites: [SITES[1]] },
  { user_id: 12, name: "Mia Haddad", email: "mia@acme.example", role: "Manager", site: null, sites: SITES },
];

const companyAdmin = (url: URL) => {
  if (url.pathname.endsWith("/company-admin/sites")) return SITES.map((s) => ({ ...s, categories: [] }));
  if (url.pathname.endsWith("/company-admin/users")) return PEOPLE;
  return undefined;
};

const openPerson = async (page: Page, name: string) => {
  await page.goto("/users");
  await page.getByRole("row", { name: new RegExp(name) }).click();
  return page.getByRole("dialog", { name: new RegExp(name) });
};

test("an Admin gives Ravi a topic from Mia; Save says what moved", async ({ page }) => {
  const calls = await kpiApp(page, { role: "Admin", user: OMAR, other: companyAdmin });
  const drawer = await openPerson(page, "Ravi Kumar");
  const field = drawer.getByTestId("kpi-topics-field");
  await expect(field.getByText("KPI topics", { exact: true })).toBeVisible();
  const chip = (name: string) => field.getByRole("button", { name, exact: true });
  await expect(chip("Water")).toHaveAttribute("aria-pressed", "true");
  await expect(chip("Health and safety")).toHaveAttribute("aria-pressed", "true");
  await expect(chip("Materials")).toHaveAttribute("aria-pressed", "false");
  // One site only: no site restriction to offer.
  await expect(field.getByText("Only at some of their sites")).toHaveCount(0);

  await chip("Materials").click();
  await expect(chip("Materials")).toHaveAttribute("aria-pressed", "true");
  await drawer.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Saved Ravi Kumar")).toBeVisible();
  await expect(page.getByText("Materials at Bahrain plant moved from Mia Haddad to Ravi Kumar.")).toBeVisible();
  const put = calls.find((c) => c.method === "PUT" && c.path.endsWith("/kpi/people/11/topics"));
  expect(put?.body).toEqual({ topics: ["climate", "energy", "water", "waste", "pollution", "materials", "health_safety"] });
  // Only the topics changed: the person's own record wasn't touched.
  expect(calls.some((c) => c.method === "PATCH")).toBe(false);
});

test("a Manager's topics can be limited to some of their sites", async ({ page }) => {
  const calls = await kpiApp(page, { role: "Admin", user: OMAR, other: companyAdmin });
  const drawer = await openPerson(page, "Mia Haddad");
  const field = drawer.getByTestId("kpi-topics-field");
  await field.getByRole("button", { name: "Waste", exact: true }).click();
  await field.getByRole("switch", { name: "Only at some of their sites" }).click();
  await field.getByRole("checkbox", { name: "Dammam" }).uncheck();
  await field.getByRole("checkbox", { name: "Matola" }).uncheck();
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Waste at Bahrain plant moved from Ravi Kumar to Mia Haddad.")).toBeVisible();
  const put = calls.find((c) => c.method === "PUT" && c.path.endsWith("/kpi/people/12/topics"));
  expect(put?.body).toEqual({ topics: ["waste", "materials"], site_ids: [1] });
});

test("with the switch off, the users drawer has no KPI topics field", async ({ page }) => {
  await kpiApp(page, { role: "Admin", user: OMAR, enabled: false, other: companyAdmin });
  const drawer = await openPerson(page, "Ravi Kumar");
  await expect(drawer.getByLabel("Email")).toBeVisible();
  await expect(drawer.getByTestId("kpi-topics-field")).toHaveCount(0);
});

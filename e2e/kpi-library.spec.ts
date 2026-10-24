import { type Page, expect, test } from "@playwright/test";
import { KPI_DEFINITIONS, KPI_DISCLOSURES, KPI_FRAMEWORKS, KPI_MAPPINGS } from "../src/test/msw/kpiData";

/**
 * KPI-2 · Superadmin KPI library (/setup/kpi-library). The library endpoints
 * answer from the KPI-0 sample data in memory; writes are recorded.
 */

type Call = { method: string; path: string; body: unknown };

async function signIn(page: Page, opts: { role?: string; failDefinitions?: number } = {}) {
  const role = opts.role ?? "Superadmin";
  const user = role === "Superadmin" ? { name: "Sam Staff", email: "sam@example.com" } : { user_id: 11, name: "Ravi", site: { site_id: 1, company: { company_id: 1, kpi_tracking_enabled: true } } };
  const calls: Call[] = [];
  let definitions = structuredClone(KPI_DEFINITIONS);
  let failures = opts.failDefinitions ?? 0;
  await page.addInitScript(
    ([r, u]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [role, JSON.stringify(user)],
  );
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const body = method === "GET" ? null : (request.postDataJSON() as Record<string, unknown> | null);
      if (method !== "GET") calls.push({ method, path, body });

      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/kpi/status")) return json({ enabled: true, setup_completed: true });
      if (path.endsWith("/kpi/library/frameworks")) return json(KPI_FRAMEWORKS);
      if (path.endsWith("/kpi/library/disclosures")) return json(KPI_DISCLOSURES);
      if (path.endsWith("/kpi/library/mappings")) return json(KPI_MAPPINGS);
      if (path.endsWith("/kpi/library/definitions")) {
        if (failures-- > 0) return json({ message: "Database is busy" }, 500);
        return json(definitions);
      }
      const one = /\/kpi\/library\/definitions\/(\d+)$/.exec(path);
      if (one && method === "PUT") {
        definitions = definitions.map((d) => (d.id === Number(one[1]) ? { ...d, ...body } : d));
        return json(definitions.find((d) => d.id === Number(one[1])));
      }
      return json({});
    },
  );
  return calls;
}

const table = (page: Page) => page.getByRole("table", { name: "KPI library" });
const bodyRows = (page: Page) => table(page).locator("tbody tr");

test("a superadmin finds the library under Setup and filters it by source, topic and disclosure code", async ({ page }) => {
  await signIn(page);
  await page.goto("/console");
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("menuitem", { name: "KPI library" }).or(page.getByRole("link", { name: "KPI library" })).first().click();
  await expect(page).toHaveURL(/\/setup\/kpi-library$/);
  await expect(page.getByRole("heading", { name: "KPI library", level: 1 })).toBeVisible();
  await expect(page.getByText("32 KPIs · 8 filled from data · 4 calculated · 20 entered")).toBeVisible();
  await expect(bodyRows(page)).toHaveCount(32);

  await page.getByRole("button", { name: "How it's filled: All" }).click();
  await page.getByRole("checkbox", { name: "Auto" }).click();
  await expect(page.getByRole("checkbox", { name: "Auto" })).toBeChecked();
  await expect(bodyRows(page)).toHaveCount(8);
  await expect(page).toHaveURL(/source=auto/);
  await page.keyboard.press("Escape");

  await page.goto("/setup/kpi-library?topic=water");
  await expect(bodyRows(page)).toHaveCount(3);
  await page.getByPlaceholder("Search name, code or disclosure").fill("303-3");
  await expect(bodyRows(page)).toHaveCount(1);
  await expect(bodyRows(page).first()).toContainText("Water withdrawn");
  await expect(bodyRows(page).first()).toContainText("BRSR P6-E3 · Core");

  await page.getByPlaceholder("Search name, code or disclosure").fill("nothing like this");
  await expect(page.getByText("No KPIs match these filters.")).toBeVisible();
});

test("a KPI opens in a drawer with its definition and where it's used", async ({ page }) => {
  await signIn(page);
  await page.goto("/setup/kpi-library");
  await bodyRows(page).filter({ hasText: "Water withdrawn" }).click();
  const drawer = page.getByRole("dialog", { name: "Water withdrawn" });
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(/kpi=13/);
  await expect(drawer.getByText("How much water did ‹site› take in during ‹period›?")).toBeVisible();
  await expect(drawer.getByText(/municipal supply, borewells/)).toBeVisible();
  const used = drawer.getByRole("table", { name: "Disclosures this KPI answers" });
  await expect(used.locator("tbody tr")).toHaveCount(3);
  await expect(used).toContainText("303-3");
  await expect(used).toContainText("P6-E3");
  await expect(used).toContainText("E3-4");
  await expect(used).toContainText("Partial");
  await expect(used).toContainText("kL");

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page).not.toHaveURL(/kpi=/);
});

test("a calculated KPI's formula is checked as it's typed, and an edited question is saved", async ({ page }) => {
  const calls = await signIn(page);
  await page.goto("/setup/kpi-library?kpi=11");
  const drawer = page.getByRole("dialog", { name: "Water consumed" });
  await expect(drawer.getByText("WATER_WITHDRAWAL - WATER_DISCHARGE")).toBeVisible();
  await expect(drawer.getByText("Formula checks out: uses 2 KPIs, all in the library.")).toBeVisible();

  await drawer.getByRole("button", { name: "Edit" }).click();
  const formula = drawer.getByRole("textbox", { name: "Formula" });
  await formula.fill("WATER_IN - WATER_DISCHARGE");
  await expect(drawer.getByText("Not in the library: WATER_IN.")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Save" })).toBeDisabled();
  await formula.fill("WATER_WITHDRAWAL - WATER_DISCHARGE");
  await expect(drawer.getByRole("button", { name: "Save" })).toBeEnabled();

  await drawer.getByRole("textbox", { name: "Question" }).fill("How much water did {site} use up in {period}, after discharge?");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Water consumed saved")).toBeVisible();
  await expect(drawer.getByText("How much water did ‹site› use up in ‹period›, after discharge?")).toBeVisible();
  expect(calls).toContainEqual({
    method: "PUT",
    path: expect.stringMatching(/\/kpi\/library\/definitions\/11$/),
    body: { question: "How much water did {site} use up in {period}, after discharge?", help: null, formula: "WATER_WITHDRAWAL - WATER_DISCHARGE" },
  });
});

test("the disclosures tab shows coverage per framework version and marks what isn't mapped", async ({ page }) => {
  await signIn(page);
  await page.goto("/setup/kpi-library?tab=disclosures");
  await expect(page.getByText(/20 of 22 disclosures have a KPI/)).toBeVisible();
  await page.getByRole("radio", { name: "ESRS 2023" }).click();
  await expect(page.getByText(/11 of 15 disclosures have a KPI/)).toBeVisible();
  const e1 = page.getByRole("region", { name: "E1 Climate change" });
  await expect(e1.getByText("2 of 4 mapped")).toBeVisible();
  await expect(e1.getByRole("listitem").filter({ hasText: "E1-4" })).toContainText("Not mapped");
  // A mapped KPI opens its drawer.
  await e1.getByRole("button", { name: "Energy consumed", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Energy consumed" })).toBeVisible();
});

test("a failed load says so and retries", async ({ page }) => {
  await signIn(page, { failDefinitions: 2 });
  await page.goto("/setup/kpi-library");
  await expect(page.getByText("Database is busy")).toBeVisible();
  await page.getByRole("button", { name: /Try again|Retry/ }).click();
  await expect(bodyRows(page)).toHaveCount(32);
});

test("other roles can't open the library", async ({ page }) => {
  await signIn(page, { role: "User" });
  await page.goto("/setup/kpi-library");
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
});

test("D19 · KPIs carry a pillar badge, filter by pillar, topics sit under pillar headings, and a Superadmin can override a KPI's pillar", async ({ page }) => {
  const calls = await signIn(page);
  await page.goto("/setup/kpi-library");
  await expect(bodyRows(page)).toHaveCount(32);
  const byPillar = page.getByTestId("library-topics-by-pillar");
  await expect(byPillar.getByRole("heading")).toHaveText([/Environment/, /Social/, /Governance/]);
  await expect(byPillar.getByRole("heading", { name: /Governance/ }).locator("..")).toContainText("Business ethics");
  // A topic under its pillar filters the table.
  await byPillar.getByRole("button", { name: /^Water/ }).click();
  await expect(page).toHaveURL(/topic=water/);
  await expect(bodyRows(page)).toHaveCount(3);
  await byPillar.getByRole("button", { name: /^Water/ }).click();
  await expect(bodyRows(page)).toHaveCount(32);

  const chips = page.getByTestId("library-pillar-chips");
  await chips.getByRole("button", { name: /Governance/ }).click();
  await expect(page).toHaveURL(/pillar=governance/);
  await expect(bodyRows(page)).toHaveCount(3);
  await expect(bodyRows(page).first()).toContainText("Women on the board");
  await expect(bodyRows(page).first().getByTestId("pillar-badge")).toContainText("G");

  // Board diversity was moved to Governance: the drawer says it differs from its topic.
  await bodyRows(page).first().click();
  const board = page.getByRole("dialog", { name: "Women on the board" });
  await expect(board.getByTestId("pillar-override-note")).toHaveText("Differs from its topic (Diversity → Social)");
  await page.keyboard.press("Escape");
  await chips.getByRole("button", { name: "All pillars" }).click();

  // Water withdrawn: Environment by default; move it to Social and save.
  await bodyRows(page).filter({ hasText: "Water withdrawn" }).click();
  const drawer = page.getByRole("dialog", { name: "Water withdrawn" });
  await expect(drawer.getByTestId("pillar-override-note")).toHaveCount(0);
  await drawer.getByRole("button", { name: "Edit" }).click();
  await expect(drawer.getByLabel("Pillar")).toHaveValue("environment");
  await drawer.getByLabel("Pillar").selectOption("social");
  await expect(drawer.getByTestId("pillar-override-note")).toHaveText("Differs from its topic (Water → Environment)");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Water withdrawn saved")).toBeVisible();
  expect(calls.find((c) => c.method === "PUT" && c.path.endsWith("/kpi/library/definitions/13"))?.body).toEqual({ question: expect.any(String), help: expect.any(String), pillar: "social" });
  await expect(drawer.getByTestId("pillar-override-note")).toHaveText("Differs from its topic (Water → Environment)");
});

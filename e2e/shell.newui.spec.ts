import { type Page, expect, test } from "@playwright/test";

/**
 * F2 app shell smoke tests. Runs against the dev server started with
 * VITE_NEW_UI=1 (project "new-ui"); every API call is answered locally.
 */

type Role = "User" | "Manager" | "Admin" | "Superadmin";

const company = { company_id: 3, name: "Glochem" };
const users: Record<Role, object> = {
  User: { name: "Uma User", email: "uma@example.com", site: { site_id: 1, company } },
  Manager: { name: "Mia Manager", email: "mia@example.com", sites: [{ site_id: 1, company }] },
  Admin: { name: "Ada Admin", email: "ada@example.com", site: { site_id: 1, company } },
  Superadmin: { name: "Sam Staff", email: "sam@example.com" },
};

interface SignInOptions {
  /** Body for GET /brands/mine; Glochem without logos by default. */
  brand?: object;
  /** Body for GET /auth/me/appearance. */
  appearance?: string;
  /** Collects the bodies of PUT /auth/me/appearance. */
  saved?: unknown[];
}

const glochem = { companyId: 3, name: "Glochem", primary: "#a01c2c", accent: "#333333", coverFrom: "#a01c2c", coverTo: "#333333", logoUrl: null };

async function signIn(page: Page, role: Role, options: SignInOptions = {}) {
  const user = users[role];
  await page.addInitScript(
    ([r, u]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [role, JSON.stringify(user)],
  );
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) => route.fulfill({ json: body });
      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) {
        if (route.request().method() === "PUT") {
          const body = route.request().postDataJSON();
          options.saved?.push(body);
          return json(body);
        }
        return json({ appearance: options.appearance ?? "system" });
      }
      if (path.endsWith("/brands/mine")) return json(options.brand ?? glochem);
      if (path.endsWith("/notifications/unread")) return json({ count: 2 });
      if (path.endsWith("/notifications"))
        return json({
          total: 2,
          notifications: [
            { id: 1, type: "ENTRY_APPROVED", title: "Entry approved", message: "Diesel, Sep 2026", link: null, read: false, created_at: new Date().toISOString() },
            { id: 2, type: "REMINDER", title: "Data due", message: "Electricity for Oct", link: null, read: true, created_at: new Date().toISOString() },
          ],
        });
      if (path.endsWith("/admin/companies")) return json({ companies: [company, { company_id: 1, name: "Midal Cables" }] });
      if (path.includes("/brands/")) return json(glochem);
      return json({});
    },
  );
}

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test("old manager path redirects and the nav shows only manager items", async ({ page }) => {
  await signIn(page, "Manager");
  await page.goto("/manager-dashboard");
  await expect(page).toHaveURL(/\/overview$/);
  const nav = mainNav(page);
  for (const label of ["Overview", "Data", "Reports", "Targets (SBTi)", "Products (PCF)", "Team"]) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(nav.getByText("Console")).toHaveCount(0);
});

test("a forbidden deep link shows 403, not the login", async ({ page }) => {
  await signIn(page, "Manager");
  await page.goto("/console");
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await expect(page).toHaveURL(/\/console$/);
});

test("signed-out deep link goes to the login", async ({ page }) => {
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login$/);
});

test("menus open and move with the keyboard, Esc closes", async ({ page }) => {
  await signIn(page, "Manager");
  // C02/C03 still show the PCF placeholder under /products/*.
  await page.goto("/products/new");
  await expect(page.getByRole("heading", { name: "Products (PCF)" })).toBeVisible();
  const data = mainNav(page).getByRole("button", { name: "Data" });
  await data.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Approvals" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Emissions ledger" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(data).toBeFocused();
});

test("bell popover lists notifications and links to all", async ({ page }) => {
  await signIn(page, "User");
  await page.goto("/");
  await expect(page).toHaveURL(/\/my-month$/);
  await page.getByRole("button", { name: "Notifications, 2 unread" }).click();
  const popover = page.getByRole("dialog", { name: "Notifications" });
  await expect(popover.getByText("Entry approved")).toBeVisible();
  await expect(popover.getByRole("button", { name: "Mark all read" })).toBeEnabled();
  await popover.getByRole("button", { name: "See all" }).click();
  await expect(page).toHaveURL(/\/notifications$/);
});

test("avatar menu has appearance, settings and sign out", async ({ page }) => {
  const saved: unknown[] = [];
  await signIn(page, "Admin", { saved });
  await page.goto("/");
  await expect(page).toHaveURL(/\/users$/);
  await page.getByRole("button", { name: "Account menu for Ada Admin" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect.poll(() => saved).toContainEqual({ appearance: "dark" });
  await page.getByRole("button", { name: "Account menu for Ada Admin" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

const midal = {
  companyId: 1,
  name: "Midal Cables",
  primary: "#0b2e5c",
  accent: "#2f6fb0",
  coverFrom: "#061933",
  coverTo: "#0b2e5c",
  logoUrl: "https://cdn.example.com/midal-light.png",
  logoOnDarkUrl: "https://cdn.example.com/midal-dark.png",
  scope3Colour: null,
};

for (const [look, logo] of [
  ["classic", midal.logoOnDarkUrl],
  ["light", midal.logoUrl],
] as const) {
  test(`Midal ${look} brand themes the shell`, async ({ page }) => {
    await page.route("https://cdn.example.com/**", (route) => route.fulfill({ status: 204 }));
    await signIn(page, "Manager", { brand: { ...midal, defaultLook: look }, appearance: "light" });
    await page.goto("/overview");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-pack", "company-1");
    await expect(html).toHaveAttribute("data-look", look);
    await expect(page.getByRole("link", { name: "Midal Cables home" }).getByRole("img")).toHaveAttribute("src", logo);
    const chrome = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--t-chrome").trim());
    expect(chrome).not.toBe("");
  });
}

test("the account's saved appearance wins over this device", async ({ page }) => {
  await signIn(page, "Manager", { appearance: "dark" });
  await page.addInitScript(() => localStorage.setItem("appearance", "light"));
  await page.goto("/overview");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-look", "night");
});

test("an account on the default takes this device's choice", async ({ page }) => {
  const saved: unknown[] = [];
  await signIn(page, "Manager", { saved });
  await page.addInitScript(() => localStorage.setItem("appearance", "dark"));
  await page.goto("/overview");
  await expect.poll(() => saved).toContainEqual({ appearance: "dark" });
});

test("superadmin switches client and jumps with Ctrl+K", async ({ page }) => {
  await signIn(page, "Superadmin");
  await page.goto("/clients/3");
  await page.getByRole("button", { name: /Client:/ }).click();
  await page.getByRole("option", { name: "Midal Cables" }).click();
  await expect(page).toHaveURL(/\/clients\/1$/);
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search pages" }).fill("thresh");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/factors\/thresholds$/);
});

for (const width of [1280, 1024, 768, 390]) {
  test(`fits ${width}px without horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await signIn(page, "Superadmin");
    await page.goto("/clients/3");
    await expect(page.getByRole("heading", { name: "Glochem" })).toBeVisible();
    const desktop = width >= 1024;
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible({ visible: !desktop });
    await expect(mainNav(page).getByRole("button", { name: "Capture" })).toBeVisible({ visible: desktop });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    if (!desktop) {
      await page.getByRole("button", { name: "Open menu" }).click();
      const drawer = page.getByRole("dialog", { name: "Menu" });
      await expect(drawer.getByRole("link", { name: "Thresholds" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
    }
  });
}

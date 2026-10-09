import { type Page, expect, test } from "@playwright/test";

/**
 * P18 brand themes smoke tests (VITE_NEW_UI=1 server). Every API call is
 * answered locally; the PUT body is collected to check what a save sends.
 */

const midal = {
  companyId: 1,
  name: "Midal Cables",
  primary: "#0b2e5c",
  accent: "#2f6fb0",
  coverFrom: "#061933",
  coverTo: "#0b2e5c",
  logoUrl: null,
  logoPublicId: null,
  logoOnDarkUrl: null,
  defaultLook: "classic",
  scope3Colour: null,
  updatedAt: "2026-10-01T10:00:00.000Z",
};

async function signIn(page: Page, role: "Superadmin" | "Admin", saved: unknown[] = []) {
  const user =
    role === "Superadmin"
      ? { name: "Sam Staff", email: "sam@example.com" }
      : { name: "Ada Admin", email: "ada@midal.com", site: { site_id: 1, company: { company_id: 1, name: "Midal Cables" } } };
  await page.addInitScript(
    ([r, u]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [role, JSON.stringify(user)],
  );
  let brand = { ...midal };
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown) => route.fulfill({ json: body });
      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json(brand);
      if (path.endsWith("/brands/1") && request.method() === "PUT") {
        const body = request.postDataJSON();
        saved.push(body);
        brand = { ...brand, ...body, updatedAt: "2026-10-09T09:00:00.000Z" };
        return json({ message: "Brand saved", brand });
      }
      if (path.endsWith("/brands/1/logo")) return json({ message: "Logo uploaded", brand: { ...brand, logoUrl: "data:image/png;base64,iVBORw0KGgo=" } });
      if (path.endsWith("/brands/1/logo-dark")) return route.fulfill({ status: 503, json: { message: "Asset storage (R2) is not configured on the server" } });
      if (path.endsWith("/brands/1")) return json(brand);
      if (path.endsWith("/admin/companies")) return json({ companies: [{ company_id: 1, name: "Midal Cables" }] });
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      return json({});
    },
  );
}

test("superadmin edits a client theme, sees it live and saves it", async ({ page }) => {
  const saved: unknown[] = [];
  await signIn(page, "Superadmin", saved);
  await page.goto("/clients/1/brand");
  await expect(page.getByRole("heading", { name: "Brand theme · Midal Cables" })).toBeVisible();
  await expect(page.getByTestId("save-status")).toContainText("Last saved");
  await expect(page.getByTestId("contrast-summary")).toContainText("pairs pass AA");

  // The preview's tokens follow the draft.
  const scope = page.getByTestId("theme-scope");
  await page.getByLabel("Accent", { exact: true }).fill("#f2a01e");
  await expect(scope).toHaveAttribute("style", /--t-accent: #f2a01e/);
  await expect(page.getByTestId("save-status")).toHaveText("Unsaved changes");

  // Night look and the other screens render.
  await page.getByRole("radiogroup", { name: "Preview look" }).getByRole("radio", { name: "Night" }).click();
  await expect(page).toHaveURL(/look=night/);
  await page.getByRole("radiogroup", { name: "Preview screen" }).getByRole("radio", { name: "Sign in" }).click();
  await expect(page.getByText("Sign in to Midal Cables")).toBeVisible();

  // Leaving with unsaved changes asks first.
  await page.getByRole("navigation", { name: "Main" }).getByText("Console", { exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Leave without saving?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/clients\/1\/brand/);

  await page.getByRole("button", { name: "Save theme" }).click();
  await expect(page.getByText("Theme saved")).toBeVisible();
  expect(saved).toEqual([
    {
      name: "Midal Cables",
      primary: "#0b2e5c",
      accent: "#f2a01e",
      coverFrom: "#061933",
      coverTo: "#0b2e5c",
      defaultLook: "classic",
      scope3Colour: null,
    },
  ]);
  await expect(page.getByTestId("save-status")).toContainText("Last saved");
});

test("a failed dark-logo upload keeps that file staged and says what was saved", async ({ page }) => {
  const saved: unknown[] = [];
  await signIn(page, "Superadmin", saved);
  await page.goto("/clients/1/brand");
  const png = { mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") };
  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles({ name: "light.png", ...png });
  await inputs.nth(1).setInputFiles({ name: "dark.png", ...png });
  await page.getByRole("button", { name: "Save theme" }).click();
  await expect(page.getByText(/R2\) is not configured.*light-background logo was saved; the colours were not/)).toBeVisible();
  await expect(page.getByText("New logo, saved with the theme: dark.png")).toBeVisible();
  await expect(page.getByText("New logo, saved with the theme: light.png")).toHaveCount(0);
  expect(saved).toEqual([]);
});

test("company admin sees their theme read only", async ({ page }) => {
  await signIn(page, "Admin");
  await page.goto("/brand");
  await expect(page.getByRole("heading", { name: "Brand theme · Midal Cables" })).toBeVisible();
  await expect(page.getByText("View only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save theme" })).toHaveCount(0);
  await expect(page.getByLabel("Primary", { exact: true })).toBeDisabled();
});

for (const width of [1280, 1024, 768, 390]) {
  test(`fits ${width}px without horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, "Superadmin");
    await page.goto("/clients/1/brand");
    await expect(page.getByTestId("theme-scope")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

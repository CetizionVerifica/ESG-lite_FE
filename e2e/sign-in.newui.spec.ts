import { type Page, expect, test } from "@playwright/test";

/**
 * P01 sign-in smoke tests (VITE_NEW_UI=1 server). Every API call is answered
 * locally, including GET /brands/public/:slug (ESG-lite #61).
 */

const company = { company_id: 1, name: "Midal Cables" };
const midal = {
  slug: "midal",
  name: "Midal Cables",
  primary: "#0b2e5c",
  accent: "#2f6fb0",
  coverFrom: "#061933",
  coverTo: "#0b2e5c",
  logoUrl: null,
  logoOnDarkUrl: null,
  defaultLook: "classic",
};

interface Mocks {
  role?: string;
  /** Status for POST /auth/login; 200 by default. */
  loginStatus?: number;
  tokenValid?: boolean;
  resetBodies?: unknown[];
  forgotBodies?: unknown[];
}

async function mockApi(page: Page, mocks: Mocks = {}) {
  const role = mocks.role ?? "Manager";
  const user = { name: "Mia Manager", email: "mia@midal.com", sites: [{ site_id: 1, company }] };
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (path.endsWith("/brands/public/midal")) return json(midal);
      if (path.includes("/brands/public/")) return json({ message: "Not found" }, 404);
      if (path.endsWith("/auth/login")) {
        if (mocks.loginStatus && mocks.loginStatus !== 200) return json({ message: "Invalid email or password" }, mocks.loginStatus);
        return json({ token: "test-token", role, user });
      }
      if (path.endsWith("/auth/forgot-password")) {
        mocks.forgotBodies?.push(request.postDataJSON());
        return json({ message: "sent" });
      }
      if (path.includes("/auth/verify-reset-token/")) return json({ valid: mocks.tokenValid ?? true, message: "" });
      if (path.endsWith("/auth/reset-password")) {
        mocks.resetBodies?.push(request.postDataJSON());
        return json({ message: "Password reset" });
      }
      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "system" });
      if (path.endsWith("/brands/mine")) return json(midal);
      return json({});
    },
  );
}

async function fillAndSubmit(page: Page, email = "mia@midal.com") {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill("correct-horse");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("a client link shows the client's cover and signs in to the role's home", async ({ page }) => {
  await mockApi(page);
  await page.goto("/midal/login");
  await expect(page.getByRole("heading", { name: "Carbon reporting for Midal Cables" })).toBeVisible();
  await expect(page.locator("#root [data-pack]")).toHaveAttribute("data-pack", "client-midal");
  await expect(page.getByText("Powered by")).toBeVisible();
  await fillAndSubmit(page);
  await expect(page).toHaveURL(/\/overview$/);
});

test("an unknown client falls back to PlanetPulse", async ({ page }) => {
  await mockApi(page);
  await page.goto("/nobody/login");
  await expect(page.getByRole("heading", { name: "Carbon reporting for your company" })).toBeVisible();
  await expect(page.locator("#root [data-pack]")).toHaveAttribute("data-pack", "planetpulse");
});

test("wrong password shows an inline error", async ({ page }) => {
  await mockApi(page, { loginStatus: 401 });
  await page.goto("/login");
  await fillAndSubmit(page);
  await expect(page.getByRole("alert")).toContainText("Invalid email or password");
  await expect(page).toHaveURL(/\/login$/);
});

test("staff on the company sign-in are signed out and sent to the staff page", async ({ page }) => {
  await mockApi(page, { role: "Superadmin" });
  await page.goto("/login");
  await fillAndSubmit(page, "sam@planetpulse.com");
  await expect(page.getByRole("alert")).toContainText("Use the staff sign-in");
  expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  await page.getByRole("link", { name: "Go to staff sign-in" }).click();
  await expect(page).toHaveURL(/\/superadmin\/login$/);
  await expect(page.getByRole("heading", { name: "PlanetPulse staff sign in" })).toBeVisible();
});

test("a client user on the staff sign-in is signed out", async ({ page }) => {
  await mockApi(page, { role: "Manager" });
  await page.goto("/superadmin/login");
  await fillAndSubmit(page);
  await expect(page.getByRole("alert")).toContainText("Use your company sign-in");
  expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
});

test("forgot password swaps the panel in place", async ({ page }) => {
  const forgotBodies: unknown[] = [];
  await mockApi(page, { forgotBodies });
  await page.goto("/login");
  await page.getByLabel("Email").fill("mia@midal.com");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("mia@midal.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If that email has an account");
  expect(forgotBodies).toEqual([{ email: "mia@midal.com" }]);
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("reset password checks length and match, then confirms", async ({ page }) => {
  const resetBodies: unknown[] = [];
  await mockApi(page, { resetBodies });
  await page.goto("/reset-password?token=abc");
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByLabel(/^New password/).fill("short");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await page.getByLabel(/^New password/).fill("Longer-pass1");
  await page.getByLabel("Confirm new password").fill("Longer-pass2");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("The passwords don't match.")).toBeVisible();
  await page.getByLabel("Confirm new password").fill("Longer-pass1");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible();
  expect(resetBodies).toEqual([{ token: "abc", password: "Longer-pass1" }]);
});

test("an expired reset link says so", async ({ page }) => {
  await mockApi(page, { tokenValid: false });
  await page.goto("/reset-password?token=old");
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
});

test("at 390px the cover is a 120px band above the form", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/midal/login");
  const cover = page.getByRole("region", { name: "Midal Cables" });
  await expect(cover).toBeVisible();
  expect((await cover.boundingBox())?.height).toBe(120);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

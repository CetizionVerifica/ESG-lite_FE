import { type Page, expect, test } from "@playwright/test";

/**
 * P01 sign-in smoke tests. Every API call is answered
 * locally, including GET /brands/public/:slug (proposed; the mock stands in for it).
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
  /** The signed-in user's saved timezone (null: none yet). */
  timezone?: string | null;
  /** Bodies of PUT /notifications/preferences. */
  preferenceBodies?: unknown[];
  codeRequestBodies?: unknown[];
  codeVerifyBodies?: unknown[];
  /** The code POST /auth/login-otp/verify accepts; "123456" by default. */
  validCode?: string;
}

async function mockApi(page: Page, mocks: Mocks = {}) {
  const user = { name: "Mia Manager", email: "mia@midal.com", sites: [{ site_id: 1, company }], timezone: mocks.timezone ?? null };
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const role = mocks.role ?? "Manager";
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
      if (path.endsWith("/auth/login-otp/request")) {
        mocks.codeRequestBodies?.push(request.postDataJSON());
        return json({ message: "sent", expires_in_minutes: 10 });
      }
      if (path.endsWith("/auth/login-otp/verify")) {
        const body = request.postDataJSON();
        mocks.codeVerifyBodies?.push(body);
        if (body.code !== (mocks.validCode ?? "123456")) return json({ message: "That code is wrong or has expired. Check the email or ask for a new code." }, 401);
        return json({ token: "test-token", role, user });
      }
      if (path.includes("/auth/verify-reset-token/")) return json({ valid: mocks.tokenValid ?? true, message: "" });
      if (path.endsWith("/auth/reset-password")) {
        mocks.resetBodies?.push(request.postDataJSON());
        return json({ message: "Password reset" });
      }
      if (path.endsWith("/notifications/preferences") && request.method() === "PUT") {
        mocks.preferenceBodies?.push(request.postDataJSON());
        return json({ message: "Preferences updated" });
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

test("sign-in saves the browser's timezone only when none is set yet", async ({ page }) => {
  const first: unknown[] = [];
  await mockApi(page, { timezone: null, preferenceBodies: first });
  await page.goto("/login");
  await fillAndSubmit(page);
  await expect(page).toHaveURL(/\/overview$/);
  await expect.poll(() => first.length).toBe(1);
  expect(first[0]).toEqual({ timezone: expect.any(String) });
});

test("sign-in keeps a timezone chosen in Settings", async ({ page }) => {
  const bodies: unknown[] = [];
  await mockApi(page, { timezone: "Asia/Bahrain", preferenceBodies: bodies });
  await page.goto("/login");
  await fillAndSubmit(page);
  await expect(page).toHaveURL(/\/overview$/);
  await page.waitForLoadState("networkidle");
  expect(bodies).toEqual([]);
});

test("signing out and back in as another role lands on that role's home, not a 403", async ({ page }) => {
  const mocks: Mocks = { role: "Manager" };
  await mockApi(page, mocks);
  await page.goto("/login");
  await fillAndSubmit(page);
  await expect(page).toHaveURL(/\/overview$/);
  await page.getByRole("button", { name: /account menu/i }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  mocks.role = "User";
  await fillAndSubmit(page, "uma@midal.com");
  await expect(page).toHaveURL(/\/my-month$/);
  await expect(page.getByText("You don't have access to this page")).toHaveCount(0);
});

test("forgot password offers a one-time email code that signs in to the role's home", async ({ page }) => {
  const codeRequestBodies: unknown[] = [];
  const codeVerifyBodies: unknown[] = [];
  await mockApi(page, { codeRequestBodies, codeVerifyBodies });
  await page.goto("/login");
  await page.getByLabel("Email").fill("mia@midal.com");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByRole("heading", { name: "Sign in with a code" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("mia@midal.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  expect(codeRequestBodies).toEqual([{ email: "mia@midal.com" }]);
  const signIn = page.getByRole("button", { name: "Sign in", exact: true });
  await page.getByLabel(/Sign-in code/).fill("000 000");
  await signIn.click();
  await expect(page.getByRole("alert")).toContainText("wrong or has expired");

  await page.getByRole("button", { name: "Send a new code" }).click();
  await expect(page.getByRole("status")).toContainText("We've sent a new code");
  expect(codeRequestBodies).toHaveLength(2);

  await page.getByLabel(/Sign-in code/).fill("123-456");
  await expect(page.getByLabel(/Sign-in code/)).toHaveValue("123456");
  await signIn.click();
  await expect(page).toHaveURL(/\/overview$/);
  expect(codeVerifyBodies.at(-1)).toEqual({ email: "mia@midal.com", code: "123456" });
});

test("an email code for a staff account on the company sign-in is turned away", async ({ page }) => {
  await mockApi(page, { role: "Superadmin" });
  await page.goto("/login");
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await page.getByLabel("Email").fill("staff@planetpulse.example");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel(/Sign-in code/).fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("link", { name: "Go to staff sign-in" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
});

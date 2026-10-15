import { type Page, expect, test } from "@playwright/test";

/**
 * IM10 · Connect Claude consent page. ESG-lite's /oauth/authorize lands on
 * /oauth/consent?request=<id>; every API call is answered locally here.
 */

const REQUEST = "signed.request.id";
const CALLBACK = "http://localhost:6274/oauth/callback";
const info = (role: string) => ({
  client: { client_id: "c1", client_name: "Claude", redirect_host: "localhost:6274", client_uri: null, logo_uri: null },
  scopes: [
    { scope: "imports:read", description: "Read" },
    { scope: "imports:write", description: "Write" },
  ],
  resource: "http://api.example/mcp",
  user: { user_id: 5, name: "Sam Staff", email: "sam@example.com", role },
  can_allow: role === "Superadmin",
  refusal: role === "Superadmin" ? null : { code: "MCP_SUPERADMIN_ONLY", message: "Only ESGLite staff (Superadmin) can connect Claude." },
  clients_with_imports_enabled: role === "Superadmin" ? 0 : 1,
  expires_at: "2026-10-12T12:00:00Z",
});

type Sent = { method: string; path: string; body: unknown };

async function mockApi(page: Page, role: string, opts: { signedIn?: boolean; enabled?: number } = {}) {
  const sent: Sent[] = [];
  const user = { user_id: 5, name: "Sam", last_name: "Staff", email: "sam@example.com" };
  if (opts.signedIn !== false) {
    await page.addInitScript(
      ([u, r]) => {
        localStorage.setItem("token", "test-token");
        localStorage.setItem("role", r);
        localStorage.setItem("user", u);
      },
      [JSON.stringify(user), role],
    );
  }
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (req.method() !== "GET") sent.push({ method: req.method(), path: url.pathname, body: req.postDataJSON() });
      if (url.pathname.endsWith("/auth/login")) return json({ token: "test-token", role, user });
      if (url.pathname.endsWith("/auth/me")) return json({ role, user });
      if (url.pathname.endsWith("/auth/me/appearance")) return json({ appearance: "system" });
      if (url.pathname.endsWith("/brands/mine")) return json({ message: "Not found" }, 404);
      if (url.pathname.endsWith("/notifications/unread")) return json({ count: 0 });
      if (url.pathname.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (url.pathname.endsWith("/oauth/authorize/request")) {
        if (url.searchParams.get("request") !== REQUEST) return json({ code: "OAUTH_REQUEST_INVALID", message: "This sign-in request has expired or is not valid. Start again from Claude." }, 400);
        return json({ ...info(role), clients_with_imports_enabled: opts.enabled ?? info(role).clients_with_imports_enabled });
      }
      if (url.pathname.endsWith("/oauth/authorize/decision")) {
        const body = req.postDataJSON() as { decision: string };
        if (body.decision === "deny") return json({ decision: "deny", redirect_to: `${CALLBACK}?error=access_denied&state=s1` });
        if (role !== "Superadmin") return json({ code: "MCP_SUPERADMIN_ONLY", message: "Only ESGLite staff (Superadmin) can connect Claude.", redirect_to: `${CALLBACK}?error=access_denied&state=s1` }, 403);
        return json({ decision: "allow", grant_id: 1, redirect_to: `${CALLBACK}?code=esgl_ac_123&state=s1` });
      }
      return json({});
    },
  );
  // The app the person came from (Claude / MCP Inspector) answers its callback with a plain page.
  await page.route(`${CALLBACK}**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Back in Claude</h1>" }));
  return sent;
}

test("a Superadmin reads what Claude can and can't do and allows", async ({ page }) => {
  const sent = await mockApi(page, "Superadmin");
  await page.goto(`/oauth/consent?request=${REQUEST}`);
  await expect(page.getByRole("heading", { level: 1, name: /Connect Claude to ESGLite\?/ })).toBeVisible();
  await expect(page.getByText("sam@example.com")).toBeVisible();
  await expect(page.getByText("Create entries for review. It can't approve, edit or delete anything.")).toBeVisible();
  await expect(page.getByText(/can't approve, reject, edit or delete entries/)).toBeVisible();
  await expect(page.getByText("No client is ready for Claude imports yet")).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByRole("heading", { name: "Back in Claude" })).toBeVisible();
  expect(page.url()).toContain("code=esgl_ac_123");
  expect(sent).toContainEqual({ method: "POST", path: expect.stringMatching(/\/oauth\/authorize\/decision$/), body: { request: REQUEST, decision: "allow" } });
});

test("Deny sends the person back with no code", async ({ page }) => {
  const sent = await mockApi(page, "Superadmin", { enabled: 2 });
  await page.goto(`/oauth/consent?request=${REQUEST}`);
  await expect(page.getByText("No client is ready for Claude imports yet")).toHaveCount(0);
  await page.getByRole("button", { name: "Deny" }).click();
  await expect(page.getByRole("heading", { name: "Back in Claude" })).toBeVisible();
  expect(page.url()).toContain("error=access_denied");
  expect(page.url()).not.toContain("code=");
  expect(sent.at(-1)).toMatchObject({ body: { decision: "deny" } });
});

for (const role of ["Manager", "Admin", "User"]) {
  test(`a ${role} never sees the consent screen: the route is Superadmin only`, async ({ page }) => {
    await mockApi(page, role);
    await page.goto(`/oauth/consent?request=${REQUEST}`);
    await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /Connect Claude to ESGLite\?/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Allow" })).toHaveCount(0);
  });
}

test("an expired or missing request explains itself", async ({ page }) => {
  await mockApi(page, "Superadmin");
  await page.goto("/oauth/consent?request=stale");
  await expect(page.getByRole("alert")).toContainText("This sign-in request has expired or is not valid.");
  await page.goto("/oauth/consent");
  await expect(page.getByRole("alert")).toContainText("missing its sign-in request");
});

test("a signed-out Superadmin signs in through the staff door and comes back to the request", async ({ page }) => {
  await mockApi(page, "Superadmin", { signedIn: false });
  await page.goto(`/oauth/consent?request=${REQUEST}`);
  await expect(page).toHaveURL(/\/login$/);
  // The company door turns staff away but keeps where they were going.
  await page.getByLabel("Email").fill("sam@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("secret-pass");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Go to staff sign-in" }).click();
  await expect(page).toHaveURL(/\/superadmin\/login$/);
  // The staff form mounts after the URL changes; typing into the old form is lost.
  await expect(page.getByRole("heading", { name: "PlanetPulse staff sign in" })).toBeVisible();
  await page.getByLabel("Email").fill("sam@example.com");
  await expect(page.getByLabel("Email")).toHaveValue("sam@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("secret-pass");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`/oauth/consent?request=${REQUEST}`);
  await expect(page.getByRole("button", { name: "Allow" })).toBeVisible();
});

test("the consent card fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mockApi(page, "Superadmin");
  await page.goto(`/oauth/consent?request=${REQUEST}`);
  await expect(page.getByRole("button", { name: "Allow" })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});

import { type Page, expect, test } from "@playwright/test";

/**
 * P14 Settings smoke test. Every API call is answered locally.
 */

const company = { company_id: 3, name: "Glochem" };
const user = {
  user_id: 11,
  name: "Uma",
  last_name: "User",
  phone_number: "+973 3300 0000",
  email: "uma@example.com",
  site: { site_id: 7, name: "Hidd plant", company },
};
const brand = { companyId: 3, name: "Glochem", primary: "#a01c2c", accent: "#333333", coverFrom: "#a01c2c", coverTo: "#333333", logoUrl: null };

type Sent = { method: string; path: string; body: unknown };

const grants = [
  { grant_id: 7, client: { client_id: "c1", client_name: "Claude", client_uri: null, logo_uri: null }, scopes: ["imports:read", "imports:write"], created_at: "2026-10-10T09:00:00Z", last_used_at: "2026-10-12T08:00:00Z", revoked_at: null },
  { grant_id: 8, client: { client_id: "c2", client_name: "MCP Inspector", client_uri: null, logo_uri: null }, scopes: ["imports:read"], created_at: "2026-10-11T09:00:00Z", last_used_at: null, revoked_at: null },
];

async function signIn(page: Page, role: string, opts: { failPrefs?: boolean; grants?: typeof grants } = {}) {
  let live = opts.grants ?? [];
  const sent: Sent[] = [];
  await page.addInitScript(
    ([u, r]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [JSON.stringify(user), role],
  );
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (req.method() !== "GET") sent.push({ method: req.method(), path: url.pathname, body: req.postDataJSON() });
      if (url.pathname.endsWith("/notifications/preferences")) {
        if (req.method() === "GET") {
          return opts.failPrefs
            ? json({ message: "Preferences are down" }, 500)
            : json({ notification_preferences: { email_rejections: false, legacy_key: true }, timezone: "Asia/Bahrain" });
        }
        return json({ message: "ok" });
      }
      if (url.pathname.endsWith("/auth/forgot-password")) return json({ message: "sent" });
      const grant = /\/oauth\/grants\/(\d+)$/.exec(url.pathname);
      if (grant && req.method() === "DELETE") {
        live = live.filter((g) => g.grant_id !== Number(grant[1]));
        return json({ message: "Disconnected", grant_id: Number(grant[1]) });
      }
      if (url.pathname.endsWith("/oauth/grants")) return json({ grants: live, connector_url: "https://api.esglite.example/mcp" });
      if (url.pathname.endsWith("/auth/me/appearance")) return json({ appearance: req.method() === "PUT" ? "dark" : "system" });
      if (url.pathname.endsWith("/auth/me")) return json({ role, user });
      if (url.pathname.endsWith("/brands/mine")) return json(brand);
      if (url.pathname.endsWith("/notifications/unread")) return json({ count: 0 });
      if (url.pathname.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      return json({});
    },
  );
  return sent;
}

test("a contributor saves email notifications and timezone, each on its own", async ({ page }) => {
  const sent = await signIn(page, "User");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  const profile = page.getByRole("region", { name: "Profile" });
  await expect(profile.getByText("uma@example.com")).toBeVisible();
  await expect(profile.getByText("Hidd plant")).toBeVisible();

  const notifications = page.getByRole("region", { name: "Notifications" });
  const rejections = notifications.getByRole("switch", { name: "Rejections" });
  await expect(rejections).toHaveAttribute("aria-checked", "false");
  await expect(notifications.getByRole("switch", { name: "Approvals" })).toHaveAttribute("aria-checked", "true");
  await rejections.click();
  await notifications.getByRole("button", { name: "Save notifications" }).click();
  await expect(page.getByText("Email notifications saved")).toBeVisible();
  expect(sent).toContainEqual({
    method: "PUT",
    path: expect.stringMatching(/\/notifications\/preferences$/),
    body: { notification_preferences: { email_rejections: true, legacy_key: true } },
  });

  const timezone = page.getByRole("region", { name: "Timezone" });
  await expect(timezone.getByRole("button", { name: "Save timezone" })).toBeDisabled();
  await timezone.getByRole("combobox", { name: "Timezone" }).fill("kolkata");
  await page.getByRole("option", { name: /^Kolkata, Asia/ }).click();
  await timezone.getByRole("button", { name: "Save timezone" }).click();
  await expect(page.getByText("Timezone saved")).toBeVisible();
  expect(sent).toContainEqual({ method: "PUT", path: expect.stringMatching(/\/notifications\/preferences$/), body: { timezone: "Asia/Kolkata" } });
});

test("appearance applies at once and is saved to the account", async ({ page }) => {
  const sent = await signIn(page, "User");
  await page.goto("/settings");
  const appearance = page.getByRole("region", { name: "Appearance" });
  await expect(appearance.getByText("Glochem · Light")).toBeVisible();
  await appearance.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByText("Appearance saved")).toBeVisible();
  expect(sent).toContainEqual({ method: "PUT", path: expect.stringMatching(/\/auth\/me\/appearance$/), body: { appearance: "dark" } });
});

test("an admin has no email toggles, and a failed load says so", async ({ page }) => {
  await signIn(page, "Admin", { failPrefs: true });
  await page.goto("/settings");
  await expect(page.getByRole("alert").getByText("Preferences are down")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("an admin with preferences loaded is told there are no emails for the role", async ({ page }) => {
  await signIn(page, "Admin");
  await page.goto("/settings");
  await expect(page.getByText("No email notifications for your role yet")).toBeVisible();
});

test("a Superadmin sees Connected apps, disconnects Claude and gets the connector URL to add it again", async ({ page }) => {
  const sent = await signIn(page, "Superadmin", { grants });
  await page.goto("/settings?tab=apps");
  const apps = page.getByRole("region", { name: "Connected apps" });
  await expect(apps).toBeVisible();
  const list = apps.getByRole("list", { name: "Connected apps" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("Claude");
  await expect(list).toContainText("Read sites, categories and forms · Create entries for review");
  await expect(list).toContainText("Not used yet");

  await list.getByRole("listitem").filter({ hasText: "MCP Inspector" }).getByRole("button", { name: "Disconnect" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Disconnect MCP Inspector?" });
  await dialog.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText("MCP Inspector disconnected")).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  expect(sent).toContainEqual({ method: "DELETE", path: expect.stringMatching(/\/oauth\/grants\/8$/), body: null });

  await list.getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
  await expect(apps.getByText("No apps connected")).toBeVisible();
  await expect(apps.getByLabel("Connector URL")).toHaveText("https://api.esglite.example/mcp");
  await expect(apps.getByRole("button", { name: "Copy" })).toBeVisible();
});

test("other roles never see Connected apps", async ({ page }) => {
  await signIn(page, "Manager", { grants });
  await page.goto("/settings?tab=apps");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Connected apps" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Connected apps" })).toHaveCount(0);
});

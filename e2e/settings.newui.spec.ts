import { type Page, expect, test } from "@playwright/test";

/**
 * P14 Settings smoke test. Runs against the dev server started with
 * VITE_NEW_UI=1 (project "new-ui"); every API call is answered locally.
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

async function signIn(page: Page, role: string, opts: { failPrefs?: boolean } = {}) {
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
    (url) => url.port !== "4174",
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

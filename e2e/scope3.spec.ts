import { type Page, expect, test } from "@playwright/test";

/**
 * S3-0 smoke test: Settings → Scope 3 for company Admins and Superadmins,
 * hidden from everyone else. Holds for the placeholder and for S3-1's page;
 * the placeholder's own content is in scope3-placeholder.spec.ts. Every API
 * call is answered locally.
 */

const company = { company_id: 3, name: "Glochem" };
const user = { user_id: 11, name: "Ada", last_name: "Admin", email: "ada@example.com", site: { site_id: 7, name: "Hidd plant", company } };
const brand = { companyId: 3, name: "Glochem", primary: "#a01c2c", accent: "#333333", coverFrom: "#a01c2c", coverTo: "#333333", logoUrl: null };

async function signIn(page: Page, role: string) {
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
      const url = new URL(route.request().url());
      const json = (body: unknown) => route.fulfill({ status: 200, json: body });
      if (url.pathname.endsWith("/notifications/preferences")) return json({ notification_preferences: {}, timezone: "Asia/Bahrain" });
      if (url.pathname.endsWith("/oauth/grants")) return json({ grants: [], connector_url: "https://api.esglite.example/mcp" });
      if (url.pathname.endsWith("/auth/me/appearance")) return json({ appearance: "system" });
      if (url.pathname.endsWith("/auth/me")) return json({ role, user });
      if (url.pathname.endsWith("/brands/mine")) return json(brand);
      if (url.pathname.endsWith("/notifications/unread")) return json({ count: 0 });
      if (url.pathname.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      return json({});
    },
  );
}

test("a company admin opens Scope 3 from Settings", async ({ page }) => {
  await signIn(page, "Admin");
  await page.goto("/settings?tab=scope3");
  const section = page.getByRole("region", { name: "Scope 3" });
  await expect(section).toBeVisible();
  await section.getByRole("link", { name: "Open Scope 3 settings" }).click();
  await expect(page).toHaveURL(/\/settings\/scope3$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a superadmin sees the Scope 3 section too", async ({ page }) => {
  await signIn(page, "Superadmin");
  await page.goto("/settings");
  await expect(page.getByRole("region", { name: "Scope 3" })).toBeVisible();
});

test("a manager has no Scope 3 section in Settings", async ({ page }) => {
  await signIn(page, "Manager");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Scope 3" })).toHaveCount(0);
});

test("a contributor can't open the Scope 3 page", async ({ page }) => {
  await signIn(page, "User");
  await page.goto("/settings/scope3");
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
});

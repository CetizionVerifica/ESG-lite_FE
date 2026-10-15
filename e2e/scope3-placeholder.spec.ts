import { type Page, expect, test } from "@playwright/test";

/**
 * S3-0 placeholder at /settings/scope3. S3-1 deletes this file together with
 * src/features/scope3/Placeholder.tsx when its boundary page takes the route.
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

test("the placeholder lists the 15 categories with their methods", async ({ page }) => {
  await signIn(page, "Admin");
  await page.goto("/settings/scope3");
  await expect(page.getByRole("heading", { level: 1, name: "Scope 3" })).toBeVisible();
  await expect(page.getByText("Choosing your categories is coming soon")).toBeVisible();
  const list = page.getByRole("region", { name: "Categories" }).getByRole("listitem");
  await expect(list).toHaveCount(15);
  await expect(list.first()).toContainText("Category 1 · Purchased goods and services");
  await expect(list.first()).toContainText("Supplier's own figure · Supplier's energy and materials · Average for the material · From the amount spent");
  await expect(list.nth(8)).toContainText("Downstream");
});

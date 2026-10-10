import { type Page, expect, test } from "@playwright/test";

/**
 * P13 Notifications smoke test. Runs against the dev server started with
 * VITE_NEW_UI=1 (project "new-ui"); every API call is answered locally.
 */

const company = { company_id: 3, name: "Glochem" };
const user = { name: "Uma", email: "uma@example.com", site: { site_id: 7, name: "Hidd plant", company } };
const brand = { companyId: 3, name: "Glochem", primary: "#a01c2c", accent: "#333333", coverFrom: "#a01c2c", coverTo: "#333333", logoUrl: null };

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const all = [
  {
    id: 3,
    type: "REJECTED",
    title: "Emission rejected",
    message: "Your Diesel emission for Hidd plant was rejected by Mia Manager. Reason: Wrong unit",
    meta: { reviewer: "Mia Manager", reason: "Wrong unit, should be litres" },
    link: "/my-emissions",
    read: false,
    created_at: hoursAgo(0),
  },
  {
    id: 2,
    type: "DEADLINE_REMINDER",
    title: "Submission reminder",
    message: "You haven't submitted data for September 2026",
    link: "/data-entry",
    read: true,
    created_at: daysAgo(3),
  },
  {
    id: 1,
    type: "APPROVED",
    title: "Emission approved",
    message: "Your Grid electricity emission was approved by Mia Manager",
    link: null,
    read: true,
    created_at: daysAgo(20),
  },
];

const GROUPS: Record<string, string[]> = { approvals: ["APPROVED"], rejections: ["REJECTED"], reminders: ["REMINDER", "DEADLINE", "ESCALATION"] };

async function signIn(page: Page, opts: { failList?: boolean } = {}) {
  const sent: { method: string; path: string; query: string }[] = [];
  let unread = 1;
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "User");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      sent.push({ method: req.method(), path: url.pathname, query: url.search });
      if (url.pathname.endsWith("/notifications/unread")) return json({ count: unread });
      if (url.pathname.endsWith("/notifications/read-all") || url.pathname.match(/\/notifications\/\d+\/read$/)) {
        unread = 0;
        return json({ message: "ok" });
      }
      if (url.pathname.endsWith("/notifications")) {
        if (opts.failList) return json({ message: "down" }, 500);
        const type = url.searchParams.get("type");
        let list = type ? all.filter((n) => GROUPS[type].some((g) => n.type.includes(g))) : all;
        if (url.searchParams.get("unread") === "true") list = list.filter((n) => !n.read && unread > 0);
        return json({ total: list.length, notifications: list });
      }
      if (url.pathname.endsWith("/auth/me/appearance")) return json({ appearance: "system" });
      if (url.pathname.endsWith("/auth/me")) return json({ role: "User", user });
      if (url.pathname.endsWith("/brands/mine")) return json(brand);
      return json({});
    },
  );
  return sent;
}

test("lists by day, filters on the server, expands details and marks read", async ({ page }) => {
  const sent = await signIn(page);
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  await expect(page.getByText("1 unread")).toBeVisible();

  for (const label of ["Today", "This week", "Earlier"]) await expect(page.getByRole("heading", { level: 2, name: label })).toBeVisible();

  // Expanding an unread row shows who and why, and marks it read.
  const row = page.getByRole("button", { name: /^Emission rejected/ });
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Rejected by", { exact: true })).toBeVisible();
  await expect(page.getByText("Wrong unit, should be litres")).toBeVisible();
  await expect.poll(() => sent.some((s) => s.method === "PATCH" && s.path.endsWith("/notifications/3/read"))).toBe(true);
  await expect(page.getByText("All caught up")).toBeVisible();

  // Arrow keys move between rows.
  await row.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: /^Submission reminder/ })).toBeFocused();

  // Tabs filter on the server and live in the URL.
  await page.getByRole("tab", { name: "Reminders" }).click();
  await expect(page).toHaveURL(/tab=reminders/);
  await expect.poll(() => sent.some((s) => s.path.endsWith("/notifications") && s.query.includes("type=reminders"))).toBe(true);
  await expect(page.getByRole("button", { name: /^Submission reminder/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Emission approved/ })).toHaveCount(0);

  // Open follows the link (old paths redirect to the new ones).
  await page.getByRole("button", { name: /^Submission reminder/ }).click();
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/data\/new/);
});

test("mark all read and a failing list shows an error with retry", async ({ page }) => {
  const sent = await signIn(page);
  await page.goto("/notifications?tab=unread");
  await expect(page.getByRole("tab", { name: "Unread" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect.poll(() => sent.some((s) => s.method === "PATCH" && s.path.endsWith("/notifications/read-all"))).toBe(true);
  await expect(page.getByText("All caught up")).toBeVisible();

  const page2 = await page.context().newPage();
  await signIn(page2, { failList: true });
  await page2.goto("/notifications");
  await expect(page2.getByRole("alert").getByText("Couldn't load notifications")).toBeVisible();
  await expect(page2.getByRole("button", { name: "Retry" })).toBeVisible();
});

import { type Page, expect, test } from "@playwright/test";

/**
 * S3-15 part 2 · Close month (`/data/approvals?view=close&period=`), behind the
 * company's review_workflow_v2 switch. Every API call is answered locally.
 */

const company = { company_id: 1, name: "Midal Cables" };
const site = { site_id: 1, name: "Hidd", categories: [{ category_id: 10, category_name: "Diesel" }] };
const manager = (on: boolean) => ({ name: "Mia Manager", email: "mia@example.com", sites: [{ ...site, company: { ...company, review_workflow_v2: on } }] });

const category = (counts: object, nothing = false) => ({ category_id: 10, category_name: "Diesel", scope: "Scope 1", counts: { draft: 0, pending: 0, approved: 0, rejected: 0, ...counts }, nothing_this_month: nothing });
const lockRow = { company_id: 1, site_id: 1, year: 2026, month: 9, locked_by: 4, locked_at: "2026-10-12T08:00:00.000Z" };
const grid = Array.from({ length: 15 }, (_, i) => ({ n: i + 1, status: i === 0 ? "included" : "not_relevant", has_data: i === 0 }));

async function signIn(page: Page, on = true) {
  const state = { complete: false, locked: false, calls: [] as { method: string; path: string; body: unknown }[] };
  const user = manager(on);
  const lockStatus = () => ({
    year: 2026,
    month: 9,
    sites: [{ site_id: 1, name: "Hidd", locked: state.locked, lock: state.locked ? lockRow : null, categories: [state.complete ? category({ approved: 2 }) : category({ pending: 1, draft: 1 })] }],
    scope3: grid,
    left: state.complete
      ? []
      : [
          { site_id: 1, site_name: "Hidd", category_id: 10, category_name: "Diesel", reason: "pending" },
          { site_id: 1, site_name: "Hidd", category_id: 10, category_name: "Diesel", reason: "draft" },
        ],
  });
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
      if (method !== "GET") state.calls.push({ method, path, body: request.postDataJSON() });
      if (path.endsWith("/periods/lock") && method === "GET") return json(lockStatus());
      if (path.endsWith("/periods/lock")) {
        state.locked = true;
        return json(lockRow, 201);
      }
      if (path.endsWith("/periods/unlock")) {
        state.locked = false;
        return json({ ...lockRow, reopened_at: "2026-10-16T10:00:00.000Z" });
      }
      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/user/emissions/batches")) return json([]);
      if (path.endsWith("/user/emissions")) return json({ data: [], total: 0, summary: { total_emission: 0, pending_count: 0, approved_count: 0, rejected_count: 0 } });
      return json({});
    },
  );
  return state;
}

test("Close month: Lock is disabled with the reason beside it, then enabled once nothing is left", async ({ page }) => {
  const state = await signIn(page);
  await page.goto("/data/approvals?view=close&period=2026-09");

  await expect(page.getByRole("tab", { name: "Close month" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Close Sep 2026" })).toBeVisible();
  const lock = page.getByRole("button", { name: "Lock Sep 2026" });
  await expect(lock).toBeDisabled();
  await expect(page.getByText("2 items are left before you can lock.")).toBeVisible();

  const left = page.getByRole("list", { name: "Left before you can lock" });
  await expect(left.getByText("Waiting for approval")).toBeVisible();
  await expect(left.getByRole("link", { name: "Review: Diesel" })).toHaveAttribute("href", "/data/approvals?site=1&category=10&period=2026-09");
  await expect(page.getByRole("list", { name: "Scope 3 categories" }).getByRole("listitem")).toHaveCount(15);
  await expect(page.getByRole("row", { name: /Hidd/ })).toContainText("0 of 1");

  // Everything gets approved elsewhere; check again.
  state.complete = true;
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(lock).toBeEnabled();
  await expect(page.getByText("Nothing. Every site and Scope 3 category is complete.")).toBeVisible();
  await lock.click();
  await expect(page.getByText("Sep 2026 is locked")).toBeVisible();
  // A Manager locks their own site, not the whole company.
  expect(state.calls.find((c) => c.path.endsWith("/periods/lock"))?.body).toEqual({ site_id: 1, year: 2026, month: 9 });
  await expect(page.getByRole("row", { name: /Hidd/ }).getByText("Locked")).toBeVisible();
});

test("Reopen asks for a reason, traps focus and closes on Esc", async ({ page }) => {
  const state = await signIn(page);
  state.complete = true;
  state.locked = true;
  await page.goto("/data/approvals?view=close&period=2026-09");

  await page.getByRole("button", { name: "Reopen Hidd" }).click();
  const dialog = page.getByRole("dialog", { name: "Reopen Sep 2026 for Hidd?" });
  await expect(dialog).toBeVisible();
  const reason = dialog.getByLabel(/Reason/);
  await expect(reason).toBeFocused();

  // A reason is required.
  await dialog.getByRole("button", { name: "Reopen month" }).click();
  await expect(dialog.getByText("Give a reason of at least 5 characters.")).toBeVisible();
  expect(state.calls.some((c) => c.path.endsWith("/periods/unlock"))).toBe(false);

  // Focus stays inside the dialog.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Reopen Hidd" }).click();
  await dialog.getByLabel(/Reason/).fill("Late diesel invoice from the supplier");
  await dialog.getByRole("button", { name: "Reopen month" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.calls.find((c) => c.path.endsWith("/periods/unlock"))?.body).toEqual({ site_id: 1, year: 2026, month: 9, reason: "Late diesel invoice from the supplier" });
  await expect(page.getByText("Sep 2026 is open again")).toBeVisible();
});

test("with the review workflow off there is no Close month view", async ({ page }) => {
  await signIn(page, false);
  await page.goto("/data/approvals?view=close&period=2026-09");
  await expect(page.getByRole("tab", { name: "Approvals" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Close month" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Lock / })).toHaveCount(0);
});

import { type Page, expect, test } from "@playwright/test";

/**
 * P26 Thresholds smoke tests (VITE_NEW_UI=1 server). The admin endpoints answer
 * from an in-memory list, and every write is recorded so the tests can check
 * what reached the server.
 */

type Rec = { threshold_id: number; threshold_percentage: string; updated_at: string; company: { company_id: number; name: string } };

const COMPANIES = [
  { company_id: 1, name: "Midal Cables", status: true },
  { company_id: 2, name: "Gulf Foods", status: true },
];

async function signIn(page: Page, opts: { failThresholds?: boolean } = {}) {
  let thresholds: Rec[] = [{ threshold_id: 9, threshold_percentage: "3.50", updated_at: "2026-09-14T10:00:00Z", company: COMPANIES[1] }];
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const user = { name: "Sam Staff", email: "sam@example.com" };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Superadmin");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const body = request.postDataJSON() as { company_id?: number; threshold_percentage?: number } | null;
      if (method !== "GET") calls.push({ method, path, body });

      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/companies")) return json(COMPANIES);

      const one = /\/admin\/thresholds\/(\d+)$/.exec(path);
      const now = "2026-10-10T06:00:00Z";
      if (one && method === "PUT") {
        thresholds = thresholds.map((t) =>
          t.threshold_id === Number(one[1]) ? { ...t, threshold_percentage: body!.threshold_percentage!.toFixed(2), updated_at: now } : t,
        );
        return json(thresholds.find((t) => t.threshold_id === Number(one[1])));
      }
      if (one && method === "DELETE") {
        thresholds = thresholds.filter((t) => t.threshold_id !== Number(one[1]));
        return json({ message: "Threshold deleted successfully" });
      }
      if (path.endsWith("/admin/thresholds") && method === "POST") {
        const rec: Rec = {
          threshold_id: 10,
          threshold_percentage: body!.threshold_percentage!.toFixed(2),
          updated_at: now,
          company: COMPANIES.find((c) => c.company_id === body!.company_id)!,
        };
        thresholds = [...thresholds, rec];
        return json(rec, 201);
      }
      if (path.endsWith("/admin/thresholds")) return opts.failThresholds ? json({ message: "Database unavailable" }, 500) : json(thresholds);
      return json({});
    },
  );
  return { calls };
}

const table = (page: Page) => page.getByRole("table", { name: "Thresholds" });

test("a superadmin sets a threshold for a client on the default, with the 2–5% range enforced", async ({ page }) => {
  const { calls } = await signIn(page);
  // The old path still lands here.
  await page.goto("/threshold-values");
  await expect(page).toHaveURL(/\/factors\/thresholds/);
  await expect(table(page).getByRole("row")).toHaveCount(3);
  await expect(table(page).getByRole("row", { name: /Gulf Foods/ })).toContainText("3.50%");
  await expect(table(page).getByRole("row", { name: /Midal Cables/ })).toContainText("Default 5%");
  await expect(page.getByTestId("setup-summary")).toHaveText("2 clients · 1 custom, 1 on the default 5%");

  await page.getByRole("button", { name: "Set threshold for Midal Cables" }).click();
  const drawer = page.getByRole("dialog", { name: "Midal Cables" });
  await expect(drawer.getByText("Using the default 5%")).toBeVisible();
  const field = drawer.getByRole("textbox", { name: "Threshold" });
  await field.fill("6");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer.getByText("Must be between 2% and 5%.")).toBeVisible();
  expect(calls).toHaveLength(0);

  await field.fill("4.25");
  await expect(drawer.getByRole("slider", { name: "Threshold percentage" })).toHaveValue("4.25");
  await field.press("Enter");
  await expect(page.getByText("Midal Cables: threshold set to 4.25%")).toBeVisible();
  expect(calls).toEqual([{ method: "POST", path: expect.stringMatching(/\/admin\/thresholds$/), body: { company_id: 1, threshold_percentage: 4.25 } }]);
  await expect(table(page).getByRole("row", { name: /Midal Cables/ })).toContainText("4.25%");
});

test("a superadmin edits a linked threshold with the slider, then puts it back on the default", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/factors/thresholds?open=2");
  const drawer = page.getByRole("dialog", { name: "Gulf Foods" });
  const slider = drawer.getByRole("slider", { name: "Threshold percentage" });
  await expect(slider).toHaveValue("3.5");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(drawer.getByRole("textbox", { name: "Threshold" })).toHaveValue("3.51");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Gulf Foods: threshold set to 3.51%")).toBeVisible();
  expect(calls.at(-1)).toEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/thresholds\/9$/), body: { threshold_percentage: 3.51 } });
  await expect(page).not.toHaveURL(/open=/);

  // Custom filter lives in the URL.
  await page.getByRole("button", { name: /Value/ }).click();
  // A single-choice filter closes once picked.
  await page.getByRole("radio", { name: "Custom" }).click();
  await expect(page).toHaveURL(/value=custom/);
  await expect(table(page).getByRole("row")).toHaveCount(2);

  await table(page).getByRole("row", { name: /Gulf Foods/ }).click();
  await page.getByRole("dialog", { name: "Gulf Foods" }).getByRole("button", { name: "Use default 5%" }).click();
  await expect(page.getByText("Gulf Foods now uses the default 5%")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: expect.stringMatching(/\/admin\/thresholds\/9$/) });
  await expect(page.getByText("No clients match these filters.")).toBeVisible();
});

test("a failed load shows an error with Try again", async ({ page }) => {
  await signIn(page, { failThresholds: true });
  await page.goto("/factors/thresholds");
  await expect(page.getByText("Database unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

for (const width of [1280, 1024, 768, 390]) {
  test(`fits ${width}px without horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    await page.goto("/factors/thresholds");
    await expect(page.getByText("Gulf Foods").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

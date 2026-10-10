import { type Page, expect, test } from "@playwright/test";

/**
 * P17 Clients smoke tests (VITE_NEW_UI=1 server). The admin endpoints answer
 * from in-memory lists, and every write is recorded so the tests can check
 * what reached the server.
 */

type CompanyRec = Record<string, unknown> & { company_id: number; name: string };

function makeCompanies(): CompanyRec[] {
  return [
    {
      company_id: 1,
      name: "Midal Cables",
      address: "Hidd Industrial Area",
      contact_person: "Omar",
      email: "omar@midal.example",
      industry: "Metals",
      region: "GCC",
      status: true,
      isEmailVerified: true,
      esgMitraAccess: true,
      subscription_id: "sub_1",
    },
    { company_id: 2, name: "Gulf Foods", address: "Pune", contact_person: "Asha", industry: "Food", region: "India", status: false },
    { company_id: 3, name: "Empty Co", address: "Manama", contact_person: "Ali", industry: "Retail", region: "GCC", status: true },
  ];
}
const SITES = [
  { site_id: 1, name: "Hidd", company: { company_id: 1 }, country: { name: "Bahrain" } },
  { site_id: 2, name: "Askar", company: { company_id: 1 }, country: { name: "Bahrain" } },
  { site_id: 3, name: "Pune", company: { company_id: 2 }, country: { name: "India" } },
];
const USERS = [
  { user_id: 4, name: "Omar", last_name: "Saleh", email: "omar@example.com", role: "Admin", site: { site_id: 1 }, sites: [] },
  { user_id: 5, name: "Mia", last_name: "Manager", email: "mia@example.com", role: "Manager", site: null, sites: [{ site_id: 1 }, { site_id: 2 }] },
];
const MIDAL_BRAND = { companyId: 1, name: "Midal", primary: "#0b5c3b", accent: "#c8a24a", coverFrom: "#0b5c3b", coverTo: "#06301f", logoUrl: null, logoPublicId: null, defaultLook: "classic", updatedAt: "2026-10-01T00:00:00Z" };

async function signIn(page: Page) {
  let companies = makeCompanies();
  let thresholds: Array<{ threshold_id: number; threshold_percentage: number; company: { company_id: number; name: string } }> = [];
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
      const body = request.postDataJSON() as Record<string, unknown> | null;
      if (method !== "GET") calls.push({ method, path, body });

      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      const brand = /\/brands\/(\d+)$/.exec(path);
      if (brand) return json(brand[1] === "1" ? MIDAL_BRAND : { companyId: Number(brand[1]), name: "", primary: "#1f2a44", accent: "#3b82f6", logoUrl: null });
      if (path.endsWith("/admin/sites")) return json(SITES);
      if (path.endsWith("/admin/users")) return json(USERS);
      if (path.endsWith("/admin/category-mappings")) return json([{ id: 1 }, { id: 2 }]);
      if (path.endsWith("/admin/thresholds") && method === "POST") {
        const t = { threshold_id: 9, threshold_percentage: body!.threshold_percentage as number, company: { company_id: body!.company_id as number, name: "" } };
        thresholds = [t];
        return json(t, 201);
      }
      if (path.endsWith("/admin/thresholds")) return json(thresholds);
      const one = /\/admin\/companies\/(\d+)$/.exec(path);
      if (one && method === "PUT") {
        companies = companies.map((c) => (c.company_id === Number(one[1]) ? { ...c, ...body } : c));
        return json({ message: "Company updated" });
      }
      if (one && method === "DELETE") {
        companies = companies.filter((c) => c.company_id !== Number(one[1]));
        return json({ message: "Company deleted" });
      }
      if (path.endsWith("/admin/companies")) return json(companies);
      return json({});
    },
  );
  return { calls };
}

const clientsTable = (page: Page) => page.getByRole("table", { name: "Clients" });

test("a superadmin filters clients and opens one", async ({ page }) => {
  await signIn(page);
  // The old path still lands here.
  await page.goto("/companies");
  await expect(page).toHaveURL(/\/clients$/);
  const table = clientsTable(page);
  await expect(table.getByRole("row")).toHaveCount(4);
  const midal = table.getByRole("row", { name: /Midal Cables/ });
  await expect(midal).toContainText("Metals");
  await expect(midal).toContainText("Active");
  await expect(midal.getByRole("img", { name: /Brand colours/ })).toBeVisible();

  await page.getByRole("button", { name: /Status:/ }).click();
  await page.getByRole("checkbox", { name: "Inactive" }).click();
  await expect(page.getByRole("checkbox", { name: "Inactive" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/status=inactive/);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(page.getByTestId("setup-summary")).toHaveText("1 client of 3");
  await page.getByRole("button", { name: /Clear all/ }).click();

  await table.getByRole("row", { name: /Midal Cables/ }).click();
  await expect(page).toHaveURL(/\/clients\/1$/);
  await expect(page.getByRole("heading", { name: /Midal Cables/ })).toBeVisible();
  await expect(page.getByText("Verified")).toBeVisible();
  await page.getByRole("tab", { name: /Sites/ }).click();
  await expect(page).toHaveURL(/tab=sites/);
  await expect(page.getByRole("link", { name: "Askar" })).toBeVisible();
  await page.getByRole("tab", { name: /People/ }).click();
  await expect(page.getByText("Mia Manager")).toBeVisible();
  await expect(page.getByText("Company admin")).toBeVisible();
  await page.getByRole("tab", { name: /Mappings/ }).click();
  await expect(page.getByText(/2\s+of this client's own category names/)).toBeVisible();
});

test("a superadmin edits details, sets the threshold, deactivates and deletes a client", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/clients/1");
  await page.getByRole("button", { name: "Edit details" }).click();
  const drawer = page.getByRole("dialog", { name: "Edit details" });
  await drawer.getByLabel("Company name").fill(" ");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(drawer.getByText("Enter the client's name.")).toBeVisible();
  expect(calls).toHaveLength(0);
  await drawer.getByLabel("Company name").fill("Midal Cables BSC");
  await drawer.getByLabel("CIN").fill("CR-1234");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText('"Midal Cables BSC" saved')).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "PUT", path: expect.stringMatching(/\/admin\/companies\/1$/), body: { name: "Midal Cables BSC", cin_number: "CR-1234", esgMitraAccess: true } });

  await page.getByRole("tab", { name: /Threshold/ }).click();
  await page.getByLabel("Threshold (%)").fill("7");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Enter a number from 2 to 5.")).toBeVisible();
  await page.getByLabel("Threshold (%)").fill("3.5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Threshold set to 3.5%")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "POST", body: { company_id: 1, threshold_percentage: 3.5 } });

  // A client with sites can't be deleted, only deactivated.
  await page.getByRole("tab", { name: /Danger zone/ }).click();
  await expect(page.getByRole("button", { name: "Delete client" })).toBeDisabled();
  await page.getByRole("button", { name: "Deactivate" }).click();
  await page.getByRole("alertdialog", { name: /Deactivate Midal Cables BSC/ }).getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText("Midal Cables BSC deactivated")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "PUT", body: { status: false } });
  await expect(page.getByRole("button", { name: "Reactivate" })).toBeVisible();

  // A client without sites is deleted after typing its name.
  await page.goto("/clients/3?tab=danger");
  await page.getByRole("button", { name: "Delete client" }).click();
  const confirm = page.getByRole("alertdialog", { name: 'Delete client "Empty Co"?' });
  const del = confirm.getByRole("button", { name: "Delete client" });
  await expect(del).toBeDisabled();
  await confirm.getByLabel(/Type Empty Co to confirm/).fill("empty co");
  await del.click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByText("Empty Co deleted")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: expect.stringMatching(/\/admin\/companies\/3$/) });
  await expect(clientsTable(page).getByRole("row")).toHaveCount(3);
});

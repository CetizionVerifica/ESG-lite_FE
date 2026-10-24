import { type Page, expect, test } from "@playwright/test";

/**
 * P17 Clients smoke tests. The admin endpoints answer
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
  { user_id: 4, name: "Omar", last_name: "Saleh", email: "omar@example.com", role: "Admin", company: { company_id: 1 }, site: null, sites: [] },
  { user_id: 5, name: "Mia", last_name: "Manager", email: "mia@example.com", role: "Manager", site: null, sites: [{ site_id: 1 }, { site_id: 2 }] },
];
const MIDAL_BUNDLE = {
  version: 1,
  source: { company_id: 1, company_name: "Midal Cables", taken_at: "2026-10-13T08:00:00.000Z" },
  sites: [
    { key: "Hidd", name: "Hidd", address: "Hidd Industrial Area", contact_person: "Omar", country_name: "Bahrain", categories: ["Stationary Combustion"], units: [], forms: [{ category_name: "Stationary Combustion", config_name: "Diesel", columns: [] }], factors: [{ year: 2025 }, { year: 2024 }], products: [] },
    { key: "Askar", name: "Askar", address: "Askar", contact_person: "Omar", country_name: "Bahrain", categories: [], units: [], forms: [], factors: [], products: [] },
  ],
  mappings: [],
  threshold: { threshold_percentage: 4 },
  material_factors: [],
};
const MIDAL_BRAND = { companyId: 1, name: "Midal", primary: "#0b5c3b", accent: "#c8a24a", coverFrom: "#0b5c3b", coverTo: "#06301f", logoUrl: null, logoPublicId: null, defaultLook: "classic", updatedAt: "2026-10-01T00:00:00Z" };

async function signIn(page: Page) {
  let companies = makeCompanies();
  let midal: Record<string, unknown> = { ...MIDAL_BRAND };
  let thresholds: Array<{ threshold_id: number; threshold_percentage: number; company: { company_id: number; name: string } }> = [];
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const user = { name: "Sam Staff", email: "sam@example.com" };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Superadmin");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const isJson = (request.headers()["content-type"] ?? "").includes("json");
      const body = (isJson ? request.postDataJSON() : request.postData()) as Record<string, unknown> | null;
      if (method !== "GET") calls.push({ method, path, body });

      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      const brand = /\/brands\/(\d+)$/.exec(path);
      if (brand && method === "GET") return json(brand[1] === "1" ? midal : { companyId: Number(brand[1]), name: "", primary: "#1f2a44", accent: "#3b82f6", logoUrl: null });
      if (path.endsWith("/user/reporting-calendar")) return json({ fiscalYearStartMonth: 4, fiscalYearRule: "Apr 1 → Mar 31" });
      const company = /\/admin\/companies\/(\d+)$/.exec(path);
      if (company && method === "PUT" && body && ("mcp_enabled" in body || "ai_import_enabled" in body)) {
        companies = companies.map((c) => (c.company_id === Number(company[1]) ? { ...c, ...body } : c));
        return json({ message: "Company updated" });
      }
      if (path.endsWith("/admin/onboarding/company")) {
        const company = { company_id: 7, name: "Bahrain Steel", status: true };
        companies = [...companies, company];
        const invited = String(body).includes('name="sendInvite"');
        return json({ message: "Company onboarded successfully", company, ...(invited ? { invite: { sent: true } } : {}), warnings: [] }, 201);
      }
      if (brand && method === "PUT") {
        if (brand[1] === "1") midal = { ...midal, ...body, ...(body?.guidelineUrl === null ? { guidelineName: null } : {}) };
        return json({ message: "Brand saved", brand: { ...body, companyId: Number(brand[1]) } });
      }
      if (/\/brands\/1\/guideline$/.test(path) && method === "POST") {
        midal = { ...midal, guidelineUrl: "https://assets.example.invalid/brand-assets/company_1_guideline.pdf?v=1", guidelineName: "midal-colours.pdf" };
        return json({ message: "Colour guideline uploaded", brand: midal });
      }
      // Copy client setup (ESG-lite docs/setup-copy.md): the bundle, a preview and the copy.
      const bundleOf = /\/admin\/companies\/(\d+)\/setup-bundle$/.exec(path);
      if (bundleOf) return json(MIDAL_BUNDLE);
      if (path.endsWith("/admin/setup-copy/preview") || /\/admin\/companies\/\d+\/setup-copy$/.test(path)) {
        const opts = (body?.options ?? {}) as { sites?: { key: string; target: unknown }[]; include?: Record<string, boolean>; factor_years?: number[] | null; first_site?: string };
        const main = opts.first_site === "main";
        const skipped = new Set((opts.sites ?? []).filter((x) => x.target === "skip").map((x) => x.key));
        const years = opts.factor_years ?? [2025, 2024];
        const sites = MIDAL_BUNDLE.sites.map((s, i) => ({
          key: s.key,
          name: s.name,
          target: skipped.has(s.key) ? { kind: "skip", site_id: null, site_name: null } : i === 0 && main ? { kind: "reuse", site_id: 70, site_name: "Bahrain Steel - Main Site" } : { kind: "create", site_id: null, site_name: s.name },
          country_name: s.country_name,
          available_factor_years: [2025, 2024],
          counts: {
            categories: { create: 3, skip: 0 },
            units: { create: opts.include?.units === false || skipped.has(s.key) ? 0 : 2, skip: 0 },
            forms: { create: skipped.has(s.key) ? 0 : 4, skip: 0 },
            factors: { create: skipped.has(s.key) ? 0 : years.length * 10, skip: 0 },
            products: { create: opts.include?.products === false || skipped.has(s.key) ? 0 : 1, skip: 0 },
          },
          skipped: { forms: [], units: [], products: [] },
          warnings: !skipped.has(s.key) && i === 0 && main ? ["The source site is in Bahrain, this one in India: check grid and fuel factors after the copy."] : [],
        }));
        const create = sites.reduce((n, x) => n + x.counts.forms.create + x.counts.units.create + x.counts.factors.create + x.counts.products.create, 0);
        return json({
          source: { company_id: 1, company_name: "Midal Cables" },
          target: { company_id: null, company_name: null },
          sites,
          mappings: { create: 6, skip: 0 },
          threshold: "create",
          material_factors: { create: 0, skip: 0, licensed_excluded: 0 },
          columns_created: [],
          errors: [],
          warnings: [],
          totals: { create: create + 7, skip: 0 },
        });
      }
      if (path.endsWith("/admin/sites")) return json(SITES);
      if (path.endsWith("/admin/users")) return json(USERS);
      if (/\/admin\/users\/\d+\/invite$/.test(path) && method === "POST") return json({ message: "Invite sent", expiresAt: "2026-10-17T00:00:00Z" });
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
      if (one && method === "DELETE" && one[1] === "1") {
        return json(
          { code: "CLIENT_HAS_HISTORY", message: "This client has reporting history (12 entries), so it can't be deleted. Deactivate it instead.", history: { entries: 12 } },
          409,
        );
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

  // A client with reporting history can't be deleted: the server says so, and it is deactivated instead.
  await page.getByRole("tab", { name: /Danger zone/ }).click();
  await page.getByRole("button", { name: "Delete client" }).click();
  const refuse = page.getByRole("alertdialog", { name: 'Delete client "Midal Cables BSC"?' });
  await expect(refuse).toContainText("2 sites, with their categories");
  await refuse.getByLabel(/Type Midal Cables BSC to confirm/).fill("Midal Cables BSC");
  await refuse.getByRole("button", { name: "Delete client" }).click();
  await expect(refuse).toContainText("This client has reporting history (12 entries)");
  await refuse.getByRole("button", { name: "Cancel" }).click();
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

test("a superadmin onboards a client in steps, with brand colours", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/companies/onboard");
  await expect(page).toHaveURL(/\/clients\/new$/);

  // Step 1: the name is required.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter the company's name.")).toBeVisible();
  await page.getByLabel("Company name").fill("Bahrain Steel");
  await page.getByLabel("Industry").selectOption("Metals and mining");
  await page.getByLabel("Employee range").selectOption("201-500");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: admin user.
  await expect(page.getByRole("heading", { name: "Admin user" })).toBeVisible();
  await page.getByLabel("Contact name").fill("Huda");
  await page.getByLabel("Email").fill("huda@steel.example");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await page.getByLabel("Password").fill("long enough");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: access, with the backend's FY rule.
  await expect(page.getByText("Apr 1 → Mar 31")).toBeVisible();
  await page.getByRole("switch", { name: /ESG-Mitra/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: brand; the primary drives the cover preview.
  await page.getByRole("textbox", { name: "Accent" }).fill("#c8a24a");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Pick a primary colour to go with the accent.")).toBeVisible();
  await page.getByRole("textbox", { name: "Primary" }).fill("#0b5c3b");
  await expect(page.getByRole("img", { name: "Sign-in cover preview" })).toContainText("Sign in to Bahrain Steel");
  // Third file input: logo, dark logo, colour guideline.
  await page.locator('input[type="file"]').nth(2).setInputFiles({ name: "steel-colours.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 5: start empty.
  await expect(page.getByRole("heading", { name: "Start from" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Review, then create.
  await expect(page.getByRole("heading", { name: "Review and create" })).toBeVisible();
  await expect(page.getByText("huda@steel.example")).toBeVisible();
  await expect(page.getByText("steel-colours.pdf")).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.getByRole("button", { name: "Create client" }).click();

  await expect(page.getByRole("heading", { name: "Bahrain Steel is onboarded" })).toBeVisible();
  const form = calls.find((c) => c.path.endsWith("/admin/onboarding/company"))!;
  for (const part of ["Bahrain Steel", "Metals and mining", "201-500", "huda@steel.example", "long enough", "esgMitraAccess", 'name="colorGuideline"; filename="steel-colours.pdf"']) expect(String(form.body)).toContain(part);
  expect(calls.at(-1)).toMatchObject({ method: "PUT", path: expect.stringMatching(/\/brands\/7$/), body: { name: "Bahrain Steel", primary: "#0b5c3b", coverTo: "#0b5c3b" } });
  await page.getByRole("link", { name: "Open client" }).click();
  await expect(page).toHaveURL(/\/clients\/7$/);
});

test("a superadmin onboards a client with an invite instead of a password, and resends one", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/clients/new");
  await page.getByLabel("Company name").fill("Bahrain Steel");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Contact name").fill("Huda");
  await page.getByRole("textbox", { name: /^Email/ }).fill("huda@steel.example");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Set a password, or send an invite instead.")).toBeVisible();
  await page.getByRole("switch", { name: /Sign-in/ }).click();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Invite by email")).toBeVisible();
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByText("An invite went to huda@steel.example.")).toBeVisible();
  const form = String(calls.find((c) => c.path.endsWith("/admin/onboarding/company"))!.body);
  expect(form).toContain('name="sendInvite"');
  expect(form).not.toContain('name="password"');

  await page.goto("/clients/1?tab=people");
  await page.getByRole("button", { name: "Send Mia Manager an invite" }).click();
  await expect(page.getByText("Invite sent to mia@example.com")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "POST", path: expect.stringMatching(/\/admin\/users\/\d+\/invite$/) });
});

test("leaving a half-filled onboarding asks first", async ({ page }) => {
  await signIn(page);
  await page.goto("/clients/new");
  await page.getByLabel("Company name").fill("Draft Co");
  await page.getByRole("button", { name: "Cancel" }).click();
  const ask = page.getByRole("alertdialog", { name: "Leave without creating the client?" });
  await ask.getByRole("button", { name: "Stay" }).click();
  await expect(page).toHaveURL(/\/clients\/new$/);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/clients$/);
});

test("a superadmin uploads and removes a client's colour guideline", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/clients/1?tab=brand");
  await expect(page.getByText("No colour guideline yet.")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "midal-colours.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  await expect(page.getByText("Colour guideline saved")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "POST", path: expect.stringMatching(/\/brands\/1\/guideline$/) });
  const link = page.getByRole("link", { name: "midal-colours.pdf" });
  await expect(link).toHaveAttribute("href", /company_1_guideline\.pdf/);

  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("alertdialog", { name: "Remove the colour guideline?" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Colour guideline removed")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "PUT", body: { guidelineUrl: null } });
  await expect(page.getByText("No colour guideline yet.")).toBeVisible();
});

test("a superadmin allows Claude imports for a client from its overview", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/clients/1");
  const toggle = page.getByRole("switch", { name: "Allow Claude imports" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText(/Off: every Claude import for this client is refused/)).toBeVisible();
  await toggle.click();
  await expect(page.getByText("Claude imports allowed for Midal Cables")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(calls).toContainEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/companies\/1$/), body: { mcp_enabled: true } });
});

test("a superadmin turns Smart import on for a client from its overview", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/clients/1");
  const toggle = page.getByRole("switch", { name: "Smart import" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText(/Off: managers map columns themselves/)).toBeVisible();
  await toggle.click();
  await expect(page.getByText("Smart import on for Midal Cables")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(calls).toContainEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/companies\/1$/), body: { ai_import_enabled: true } });
});

test("a superadmin sets what the client's contributors see and its default currency (SE-3)", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/clients/1");
  const entry = page.getByTestId("entry-settings");
  await expect(entry.getByRole("radio", { name: "Total only" })).toHaveAttribute("aria-checked", "true");
  await expect(entry.getByText("Their fields and the tCO₂e total, like the old screens.")).toBeVisible();
  await entry.getByRole("radio", { name: "Full calculation" }).click();
  await expect(page.getByText("Midal Cables: contributors see the full calculation")).toBeVisible();
  expect(calls).toContainEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/companies\/1$/), body: { entry_detail: "full" } });
  await entry.getByLabel("Default currency").selectOption("USD");
  await expect(page.getByText("Midal Cables: default currency USD")).toBeVisible();
  expect(calls).toContainEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/companies\/1$/), body: { default_currency: "USD" } });
});

test("a superadmin onboards a client that starts from another client's setup", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/clients/new");
  await page.getByLabel("Company name").fill("Bahrain Steel");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Contact name").fill("Huda");
  await page.getByLabel("Email").fill("huda@steel.example");
  await page.getByLabel("Password").fill("long enough");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 5: start from Midal's setup; the preview shows where each site goes and what is created.
  await expect(page.getByRole("heading", { name: "Start from" })).toBeVisible();
  await page.getByRole("radio", { name: "An existing client" }).click();
  await page.getByLabel("Client").selectOption("Midal Cables");
  await expect(page.getByText("The new client's main site")).toBeVisible();
  await expect(page.getByText("check grid and fuel factors", { exact: false })).toBeVisible();
  // Newest and current year by default (the mock has 2025 and 2024): 2024 is off until ticked.
  await expect(page.getByRole("checkbox", { name: "2025" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "2024" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Products" }).uncheck();
  await expect(page.getByRole("row", { name: /Hidd/ })).toContainText("10");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Review and create" })).toBeVisible();
  await expect(page.getByText("Midal Cables", { exact: true })).toBeVisible();
  await expect(page.getByText("2025", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create client" }).click();

  await expect(page.getByRole("heading", { name: "Bahrain Steel is onboarded" })).toBeVisible();
  await expect(page.getByText("Copied: 1 new site, 8 forms, 4 units, 20 factors, 6 mappings, threshold", { exact: false })).toBeVisible();
  const copy = calls.find((c) => c.path.endsWith("/admin/companies/7/setup-copy"))!;
  expect(copy.body).toMatchObject({
    source: { company_id: 1 },
    options: { first_site: "main", factor_years: [2025], form_conflict: "skip", include: { forms: true, products: false, material_factors: false } },
  });
  // The preview ran against no client at all; only the copy names the new one.
  expect(calls.filter((c) => c.path.endsWith("/setup-copy/preview")).every((c) => !("target_company_id" in (c.body as object)))).toBe(true);
});

test("a superadmin copies a setup file onto a client and downloads a client's setup", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/clients/3");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download setup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("esglite-setup-midal-cables-2026-10-13.json");

  await page.getByRole("button", { name: "Copy setup here" }).click();
  const drawer = page.getByRole("dialog", { name: "Copy setup to Empty Co" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Copy setup" })).toBeDisabled();
  await drawer.getByRole("radio", { name: "A setup file" }).click();
  await drawer.locator('input[type="file"]').setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"hello":1}') });
  await expect(drawer.getByText("This file isn't an ESGLite setup file.")).toBeVisible();
  await drawer.locator('input[type="file"]').setInputFiles({ name: "midal.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(MIDAL_BUNDLE)) });
  await expect(drawer.getByText("Setup of Midal Cables", { exact: false })).toBeVisible();
  await drawer.getByRole("combobox", { name: "Where Askar goes" }).selectOption("Skip this site");
  await expect(drawer.getByRole("row", { name: /Askar/ })).toContainText("0");
  await expect(drawer.getByText("Will create: 1 new site, 4 forms, 2 units, 10 factors, 6 mappings, threshold, 1 product")).toBeVisible();
  await drawer.getByRole("button", { name: "Copy setup" }).click();
  await expect(drawer.getByText("Copied: 1 new site, 4 forms, 2 units, 10 factors, 6 mappings, threshold, 1 product")).toBeVisible();
  const copy = calls.find((c) => c.path.endsWith("/admin/companies/3/setup-copy"))!;
  expect(copy.body).toMatchObject({ source: { bundle: { source: { company_name: "Midal Cables" } } }, options: { sites: [{ key: "Askar", target: "skip" }], factor_years: [2025] } });
  await drawer.getByRole("button", { name: "Done" }).click();
  await expect(drawer).toBeHidden();
});

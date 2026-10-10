import { type Page, expect, test } from "@playwright/test";

/**
 * P15 Company users smoke tests (VITE_NEW_UI=1 server). /company-admin/* and
 * /auth/forgot-password are answered from memory, and every write is
 * recorded so the tests can check what reached the server.
 */

type Site = { site_id: number; name: string };
type Person = { user_id: number; name: string; email: string; role: string; site: Site | null; sites: Site[] };

const company = { company_id: 1, name: "Midal Cables" };
const SITES: Site[] = [
  { site_id: 1, name: "Hidd" },
  { site_id: 2, name: "Sitra" },
  { site_id: 3, name: "Askar" },
];
const admin = { name: "Ada Admin", email: "ada@example.com", role: "Admin", company };

function makePeople(): Person[] {
  return [
    { user_id: 4, name: "Omar Saleh", email: "omar@example.com", role: "User", site: null, sites: [SITES[0], SITES[1]] },
    { user_id: 5, name: "Mia Manager", email: "mia@example.com", role: "Manager", site: null, sites: [SITES[0]] },
  ];
}

async function signIn(page: Page, opts: { refuseRemove?: boolean } = {}) {
  const people = makePeople();
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Admin");
    localStorage.setItem("user", u);
  }, JSON.stringify(admin));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (method !== "GET") calls.push({ method, path, body: request.postDataJSON() });

      if (path.endsWith("/auth/me")) return json({ role: "Admin", user: admin });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/auth/forgot-password")) return json({ message: "sent" });
      if (path.endsWith("/company-admin/sites")) return json(SITES.map((s) => ({ ...s, categories: [] })));
      const one = /\/company-admin\/users\/(\d+)$/.exec(path);
      if (one && method === "PATCH") {
        const p = people.find((x) => x.user_id === Number(one[1]))!;
        const body = request.postDataJSON() as { role?: string; site_ids?: number[]; name?: string };
        if (body.role) p.role = body.role;
        if (body.name) p.name = body.name;
        if (body.site_ids) p.sites = SITES.filter((s) => body.site_ids!.includes(s.site_id));
        return json({ user: p });
      }
      if (one && method === "DELETE") {
        if (opts.refuseRemove) return json({ message: "Internal server error" }, 500);
        people.splice(people.findIndex((x) => x.user_id === Number(one[1])), 1);
        return json({ message: "ok" });
      }
      if (path.endsWith("/company-admin/users") && method === "POST") {
        const body = request.postDataJSON() as { name: string; email: string; role: string; site_ids: number[] };
        if (people.some((p) => p.email === body.email)) return json({ message: "User with this email already exists" }, 400);
        people.push({ user_id: 9, name: body.name, email: body.email, role: body.role, site: null, sites: SITES.filter((s) => body.site_ids.includes(s.site_id)) });
        return json({ user: people.at(-1) }, 201);
      }
      if (path.endsWith("/company-admin/users")) return json(people);
      return json({});
    },
  );
  return { calls };
}

const table = (page: Page) => page.getByRole("table", { name: "People" });

test("an admin invites a person, edits a role and sends a reset link", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/admin-company/users");
  await expect(page).toHaveURL(/\/users/);
  await expect(table(page).getByRole("row")).toHaveCount(3);
  // Only Hidd has a manager.
  await expect(page.getByText("Sitra, Askar", { exact: true })).toBeVisible();
  // No passwords anywhere in the table.
  await expect(table(page)).not.toContainText("••");

  await page.getByRole("button", { name: "Invite person" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Invite person" });
  await drawer.getByRole("button", { name: "Invite" }).click();
  await expect(drawer.getByText("Choose a role.")).toBeVisible();
  expect(calls).toHaveLength(0);
  await drawer.getByLabel("Name").fill("Layla Haddad");
  await drawer.getByRole("textbox", { name: "Email" }).fill("Layla@Example.com");
  await drawer.getByLabel("Role").selectOption("Manager");
  await drawer.getByLabel("Askar").check();
  await drawer.getByLabel("Temporary password").fill("temp-pass-1");
  await drawer.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText("Layla Haddad can now sign in")).toBeVisible();
  await expect(drawer).toBeHidden();
  expect(calls.slice(0, 2)).toEqual([
    { method: "POST", path: "/company-admin/users", body: { name: "Layla Haddad", email: "layla@example.com", password: "temp-pass-1", role: "Manager", site_ids: [3] } },
    { method: "POST", path: "/auth/forgot-password", body: { email: "layla@example.com" } },
  ]);
  await expect(table(page).getByRole("row")).toHaveCount(4);

  // Edit only sends what changed.
  await table(page).getByRole("row", { name: /Omar Saleh/ }).click();
  const edit = page.getByRole("dialog", { name: "Edit · Omar Saleh" });
  await edit.getByLabel("Role").selectOption("Manager");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  expect(calls.at(-1)).toEqual({ method: "PATCH", path: "/company-admin/users/4", body: { role: "Manager" } });

  // Reset link from the row menu.
  await page.getByRole("button", { name: "Actions for Mia Manager" }).click();
  await page.getByRole("menuitem", { name: "Send reset link" }).click();
  await expect(page.getByText("Reset link sent to Mia Manager")).toBeVisible();
  expect(calls.at(-1)).toEqual({ method: "POST", path: "/auth/forgot-password", body: { email: "mia@example.com" } });
});

test("remove asks first and a refusal changes nothing", async ({ page }) => {
  const { calls } = await signIn(page, { refuseRemove: true });
  await page.goto("/users?role=User");
  await expect(table(page).getByRole("row")).toHaveCount(2);
  await page.getByRole("button", { name: "Actions for Omar Saleh" }).click();
  await page.getByRole("menuitem", { name: "Remove…" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Remove Omar Saleh?" });
  await expect(dialog).toContainText("The entries they submitted are not deleted.");
  expect(calls).toHaveLength(0);
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(dialog.getByText("Couldn't remove Omar Saleh: they have entries or approvals on record. Nothing was changed.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(table(page).getByRole("row")).toHaveCount(2);
});

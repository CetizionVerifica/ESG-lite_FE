import { type Page, expect, test } from "@playwright/test";

/**
 * DS-3 · Brand kit page (`/studio/brand-kit`): a Manager edits fonts, voice
 * and palettes and saves (the PUT body is checked); an Admin reads it; with
 * the switch off the page isn't reachable. In-memory API.
 * The editor path (apply a style, shuffle twice, undo; the PDF proof shows the
 * new fonts) needs the DS-6 editor and DS-11 proof and is added with them.
 */

type Call = { method: string; path: string; body: unknown };

const KIT = {
  name: "ACME",
  logos: { primary: null, onDark: null },
  colors: { primary: "#0f5132", accent: "#f59e0b", coverFrom: "#0d1526", coverTo: "#0f5132" },
  defaultLook: "classic",
  fonts: { heading: "fraunces", body: "source-sans-3" },
  voice: "",
  palettes: [{ id: 1, name: "Primary", colors: ["#0f5132", "#ffffff"], sort: 0, contrast: [{ a: "#0f5132", b: "#ffffff", ratio: 9.4, text: true, graphic: true }] }],
  canEdit: true,
  brandControls: false,
  updatedAt: null,
};

async function mockApi(page: Page, role: string, studio: boolean, kit: object = KIT) {
  const calls: Call[] = [];
  let current = { ...kit } as Record<string, unknown>;
  const user = {
    user_id: 12,
    name: "Mia Haddad",
    email: "mia@acme.example",
    sites: [{ site_id: 1, name: "Bahrain plant", company: { company_id: 1, name: "ACME", design_studio_enabled: studio, kpi_tracking_enabled: false } }],
    company: { company_id: 1, name: "ACME", design_studio_enabled: studio },
  };
  await page.addInitScript(
    ([r, u]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [role, JSON.stringify(user)],
  );
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const body = method === "GET" ? null : (request.postDataJSON() as Record<string, unknown> | null);
      calls.push({ method, path, body });
      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/kpi/status")) return json({ enabled: false, setup_completed: false });
      if (path.endsWith("/studio/status")) return json({ enabled: studio, kinds: { ghg: studio, sustainability: false } });
      if (!studio && path.startsWith("/studio/")) return json({ code: "DS_STUDIO_OFF", message: "Off" }, 403);
      if (path.endsWith("/studio/brand-kit") && method === "GET") return json(current);
      if (path.endsWith("/studio/brand-kit") && method === "PUT") {
        const b = body as { fonts: object; voice: string; palettes: { id?: number; name: string; colors: string[] }[] };
        current = { ...current, fonts: b.fonts, voice: b.voice, palettes: b.palettes.map((p, i) => ({ id: p.id ?? 10 + i, name: p.name, colors: p.colors, sort: i, contrast: [] })), updatedAt: "2026-10-20T09:00:00.000Z" };
        return json(current);
      }
      return json({});
    },
  );
  return calls;
}

test("a Manager sets fonts, voice and a second palette, and saves", async ({ page }) => {
  const calls = await mockApi(page, "Manager", true);
  await page.goto("/studio/brand-kit");
  await expect(page.getByRole("heading", { name: "Brand kit · ACME" })).toBeVisible();
  await expect(page.getByText("Ask ESGLite support to change logos.")).toBeVisible();
  await page.getByLabel("Headings").selectOption("dm-serif-display");
  await page.getByLabel("How your reports should sound").fill("Plain, confident, specific.");
  await page.getByRole("button", { name: "Add palette" }).click();
  await expect(page.getByTestId("bk-status")).toHaveText("Unsaved changes");
  await page.getByRole("button", { name: "Save brand kit" }).click();
  await expect(page.getByTestId("bk-status")).toContainText("Last saved");

  const put = calls.find((c) => c.method === "PUT" && c.path.endsWith("/studio/brand-kit"));
  expect(put?.body).toEqual({
    fonts: { heading: "dm-serif-display", body: "source-sans-3" },
    voice: "Plain, confident, specific.",
    palettes: [
      { id: 1, name: "Primary", colors: ["#0f5132", "#ffffff"] },
      { name: "Palette 2", colors: ["#0f5132", "#f59e0b"] },
    ],
  });
});

test("an Admin reads the brand kit without editing", async ({ page }) => {
  await mockApi(page, "Admin", true, { ...KIT, canEdit: false });
  await page.goto("/studio/brand-kit");
  await expect(page.getByText("Only Managers can change the brand kit. You can use it in every design.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save brand kit" })).toHaveCount(0);
});

test("with the switch off, the brand kit isn't reachable", async ({ page }) => {
  const calls = await mockApi(page, "Manager", false);
  await page.goto("/studio/brand-kit");
  await expect(page.getByText("Design Studio isn't turned on for your company.")).toBeVisible();
  expect(calls.some((c) => c.path.endsWith("/studio/brand-kit"))).toBe(false);
});

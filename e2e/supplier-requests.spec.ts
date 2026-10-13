import { type Page, expect, test } from "@playwright/test";

/**
 * C06 Supplier requests smoke tests: the table, "Ask supplier" with the exact
 * message and an explicit Send, and the review of a received answer (boundary
 * check, AI read, accept). ESG-lite and the AI service answer from fixtures.
 */

type Req = Record<string, unknown>;

function request(id: number, status: string, extra: Req = {}): Req {
  return {
    supplier_request_id: id,
    company_id: 1,
    study: { pcf_study_id: 21, version: 2, status: "draft", boundary: "cradle_to_gate", product: { product_id: 3, name: "EC-grade wire rod 9.5 mm" }, site: { site_id: 2, name: "Bahrain plant" } },
    input: { pcf_input_id: 9, name: "EC-grade aluminium ingot", stage: "A1", unit: "kg" },
    material: "EC-grade aluminium ingot",
    unit: "kg",
    supplier_name: "Alba",
    supplier_email: "pcf@alba.example",
    due_date: "2099-06-30",
    subject: "Midal Cables: product carbon footprint data for EC-grade aluminium ingot",
    message: "Dear Alba,\n\nPlease use the link below.\nhttps://app.example/supplier/tok\n",
    status,
    link_expires_at: "2099-07-30T00:00:00.000Z",
    sent_at: "2025-05-01T10:00:00.000Z",
    opened_at: status === "sent" ? null : "2025-05-02T09:00:00.000Z",
    received_at: ["received", "accepted", "rejected"].includes(status) ? "2025-05-03T10:00:00.000Z" : null,
    decided_at: null,
    requested_by: { user_id: 2, name: "Maya Manager" },
    decided_by: null,
    decision_comment: null,
    reply: ["received", "accepted", "rejected"].includes(status)
      ? {
          value_kgco2e: 7.9,
          unit: "kg",
          boundary: "cradle_to_grave",
          standard: null,
          gwp_set: null,
          reference_start: "2024-01-01",
          reference_end: "2024-12-31",
          valid_from: null,
          valid_to: "2027-12-31",
          verifier: null,
          product_name: null,
          note: null,
          file: { name: "alba-epd.pdf", type: "application/pdf", size: 1200 },
          boundary_mismatch: true,
        }
      : null,
    accepted: null,
    created_at: "2025-05-01T10:00:00.000Z",
    updated_at: "2025-05-03T10:00:00.000Z",
    ...extra,
  };
}

const field = (value: unknown, confidence: number, reason: string, by = "ai") => ({ value, confidence, reason, by });

async function signIn(page: Page) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const state = { requests: [request(1, "sent"), request(2, "received")] as Req[], nextId: 3 };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", u);
  }, JSON.stringify({ name: "Maya Manager", email: "maya@example.com" }));
  await page.route(
    (url) => url.port !== "4173",
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (path.endsWith("/auth/me")) return json({ role: "Manager", user: { name: "Maya Manager" } });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/pcf/studies") && method === "GET") {
        return json([{ pcf_study_id: 21, version: 2, status: "draft", boundary: "cradle_to_gate", product: { product_id: 3, name: "EC-grade wire rod 9.5 mm" }, site: { site_id: 2, name: "Bahrain plant" } }]);
      }
      if (path.endsWith("/pcf/studies/21")) {
        return json({ pcf_study_id: 21, boundary: "cradle_to_gate", inputs: [{ pcf_input_id: 9, stage: "A1", name: "EC-grade aluminium ingot", unit: "kg", supplier_name: "Alba", supplier_pcf_kgco2e: null }] });
      }
      if (path.endsWith("/pcf/supplier-requests/preview")) {
        const q = url.searchParams;
        return json({
          subject: `Midal Cables: product carbon footprint data for ${q.get("material")}`,
          text: `Dear ${q.get("supplier_name") || "supplier"},\n\nMidal Cables needs the cradle-to-gate (A1–A3) footprint of ${q.get("material")}, in kg CO₂e per ${q.get("unit")}.\nhttps://app.example/supplier/<link>\n${q.get("note") ?? ""}`,
          link_placeholder: "https://app.example/supplier/<link>",
          mail_mode: "sink",
        });
      }
      if (path.endsWith("/pcf/supplier-requests") && method === "GET") {
        const status = url.searchParams.get("status");
        return json({ requests: state.requests.filter((r) => !status || r.status === status), mail_mode: "sink" });
      }
      if (path.endsWith("/pcf/supplier-requests") && method === "POST") {
        const body = route.request().postDataJSON();
        calls.push({ method, path, body });
        const r = request(state.nextId++, "sent", { material: body.material, unit: body.unit, supplier_email: body.supplier_email, supplier_name: body.supplier_name, due_date: body.due_date, input: null });
        state.requests.unshift(r);
        return json({ request: r, link: "https://app.example/supplier/AbCdEfGhIjKlMnOpQrStUvWxYz012345", mail: { mode: "sink", delivered: false, reason: "Email sending is off on this server, so the message wasn't sent. Copy the link and send it yourself." } }, 201);
      }
      let m = /\/pcf\/supplier-requests\/(\d+)\/resend$/.exec(path);
      if (m && method === "POST") {
        calls.push({ method, path, body: route.request().postDataJSON() });
        const r = state.requests.find((x) => x.supplier_request_id === Number(m![1]))!;
        return json({ request: r, link: "https://app.example/supplier/NewLinkNewLinkNewLinkNewLink00", mail: { mode: "sink", delivered: false, reason: "Email sending is off on this server, so the message wasn't sent. Copy the link and send it yourself." } });
      }
      m = /\/pcf\/supplier-requests\/(\d+)\/file$/.exec(path);
      if (m) return route.fulfill({ status: 200, headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="alba-epd.pdf"' }, body: "%PDF-1.4 fixture" });
      m = /\/pcf\/supplier-requests\/(\d+)\/accept$/.exec(path);
      if (m) {
        const body = route.request().postDataJSON();
        calls.push({ method, path, body });
        if (body.boundary && body.boundary !== "cradle_to_gate" && body.confirm_boundary !== true) return json({ message: "Confirm the boundary", boundary_mismatch: true }, 409);
        const r = request(Number(m[1]), "accepted", { decided_at: "2025-05-04T10:00:00.000Z", decided_by: { user_id: 2, name: "Maya Manager" }, accepted: { material_factor_id: 77, value_kgco2e: body.value_kgco2e, boundary: body.boundary ?? "cradle_to_gate" } });
        state.requests = state.requests.map((x) => (x.supplier_request_id === r.supplier_request_id ? r : x));
        return json({ request: r, material_factor_id: 77, applied_to_input: true, note: null });
      }
      m = /\/pcf\/supplier-requests\/(\d+)$/.exec(path);
      if (m && method === "GET") {
        const r = state.requests.find((x) => x.supplier_request_id === Number(m![1]));
        return r ? json({ request: r, mail_mode: "sink" }) : json({ message: "Supplier request not found" }, 404);
      }
      if (path === "/v1/pcf/parse-declaration" && method === "POST") {
        calls.push({ method, path, body: null });
        return json({
          file_name: "alba-epd.pdf",
          kind: "pdf",
          fields: {
            product_name: field("EC-grade aluminium ingot 99.7", 85, "“EC-grade aluminium ingot 99.7”"),
            supplier_name: field("Alba", 85, "“Issued by Alba”"),
            declared_unit: field("kg", 85, "“per kg”"),
            value_kgco2e: field(7.85, 80, "“GWP-total A1-A3: 7.85 kg CO2e per kg”"),
            boundary: field("cradle_to_gate", 85, "“A1-A3, cradle to gate”"),
            standard: field("iso14067", 80, "“ISO 14067:2018”"),
            gwp_set: field("AR6", 70, "“IPCC AR6 GWP100”"),
            reference_start: field("2024-01-01", 80, "“Reference period 2024”"),
            reference_end: field("2024-12-31", 80, "“Reference period 2024”"),
            valid_from: field(null, 0, "Not found in the document", "rule"),
            valid_to: field("2028-12-31", 55, "“valid until end of 2028”"),
            verifier: field("Verifier Ltd", 75, "“Verified by Verifier Ltd”"),
          },
          boundary_mismatch: false,
          unit_mismatch: false,
          low_confidence_fields: ["valid_to"],
          warnings: [],
          problems: [],
          ai_used: true,
          evidence: null,
        });
      }
      return json({ message: `unmocked ${method} ${path}` }, 500);
    },
  );
  return { calls, state };
}

test("lists requests and sends a new one after showing the exact message", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/products/suppliers");
  await expect(page.getByRole("heading", { name: "Supplier requests" })).toBeVisible();
  const table = page.getByRole("table", { name: "Supplier requests" });
  await expect(table.getByRole("row")).toHaveCount(3); // header + 2
  await expect(table.getByText("Received")).toBeVisible();
  await expect(table.getByText("7.9 kgCO₂e/kg")).toBeVisible();

  await page.getByRole("button", { name: "Ask supplier" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Ask a supplier for their footprint" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Footprint", exact: true }).selectOption("21");
  await dialog.getByRole("combobox", { name: "Input line" }).selectOption("9");
  await expect(dialog.getByRole("textbox", { name: "Material" })).toHaveValue("EC-grade aluminium ingot");
  await expect(dialog.getByRole("textbox", { name: "Supplier", exact: true })).toHaveValue("Alba");
  await dialog.getByRole("textbox", { name: "Supplier email" }).fill("pcf@alba.example");
  await dialog.getByRole("textbox", { name: "Note to the supplier" }).fill("PO 4711");
  await expect(page.getByTestId("ask-preview")).toContainText("Dear Alba,");
  await expect(page.getByTestId("ask-preview")).toContainText("PO 4711");
  await expect(dialog.getByText("Email sending is off on this server.")).toBeVisible();
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(0); // nothing sent before Send

  await dialog.getByRole("button", { name: "Send", exact: true }).click();
  await expect(dialog).toBeHidden();
  const sent = calls.find((c) => c.method === "POST" && c.path.endsWith("/pcf/supplier-requests"));
  expect(sent?.body).toMatchObject({ study_id: 21, input_id: 9, material: "EC-grade aluminium ingot", unit: "kg", supplier_email: "pcf@alba.example", supplier_name: "Alba", note: "PO 4711" });
  await expect(page.getByText("Request recorded")).toBeVisible();
  const drawer = page.getByRole("dialog").last();
  await expect(page.getByTestId("supplier-link")).toHaveText("https://app.example/supplier/AbCdEfGhIjKlMnOpQrStUvWxYz012345");
  await expect(drawer.getByRole("button", { name: "Copy link" })).toBeVisible();
  await expect(page).toHaveURL(/request=3/);
  await expect(page).not.toHaveURL(/study=/);

  // Send again shows the message and waits for a confirm; Esc sends nothing.
  await page.getByRole("status").filter({ hasText: "Request recorded" }).getByRole("button", { name: "Dismiss" }).click(); // the toast covers the footer
  await drawer.getByRole("button", { name: "Send again" }).click();
  const resend = page.getByRole("dialog", { name: "Send the request again?" });
  await expect(resend.getByTestId("resend-message")).toContainText("Dear Alba,");
  await page.keyboard.press("Escape");
  await expect(resend).toBeHidden();
  expect(calls.some((c) => c.path.endsWith("/resend"))).toBe(false);
  await drawer.getByRole("button", { name: "Send again" }).click();
  await resend.getByRole("button", { name: "Send again" }).click();
  await expect(resend).toBeHidden();
  expect(calls.some((c) => c.path.endsWith("/resend"))).toBe(true);
  await expect(page.getByTestId("supplier-link")).toHaveText("https://app.example/supplier/NewLinkNewLinkNewLinkNewLink00");

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/request=/);
  await expect(table.getByRole("row")).toHaveCount(4);
});

test("a received answer with another boundary is not accepted silently; the AI read corrects it", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/products/suppliers?request=2");
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "EC-grade aluminium ingot" })).toBeVisible();
  await expect(drawer.getByText("Differs from the footprint")).toBeVisible();
  await expect(drawer.getByText("Different system boundary")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Accept figure" })).toBeDisabled();

  await drawer.getByRole("button", { name: "Read with AI" }).click();
  await expect(page.getByTestId("ai-read")).toBeVisible();
  await expect(page.getByTestId("ai-chip-value")).toContainText("7.85");
  await expect(page.getByTestId("ai-chip-valid-to")).toContainText("55%");
  await expect(drawer.getByRole("textbox", { name: "kgCO₂e per kg" })).toHaveValue("7.85");
  await expect(drawer.getByRole("combobox", { name: "Boundary" })).toHaveValue("cradle_to_gate");
  await expect(drawer.getByText("Different system boundary")).toHaveCount(0);
  await expect(drawer.getByRole("textbox", { name: "Verifier" })).toHaveValue("Verifier Ltd");
  expect(calls.some((c) => c.path === "/v1/pcf/parse-declaration")).toBe(true);

  await drawer.getByRole("button", { name: "Accept figure" }).click();
  await expect(page.getByText("Supplier figure accepted")).toBeVisible();
  const accept = calls.find((c) => c.path.endsWith("/accept"));
  expect(accept?.body).toMatchObject({ value_kgco2e: 7.85, boundary: "cradle_to_gate", confirm_boundary: false, verifier: "Verifier Ltd", valid_to: "2028-12-31" });
  await expect(drawer.getByText("Accepted", { exact: true }).first()).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Accept figure" })).toHaveCount(0);
});

test("a confirmed boundary mismatch is sent as such; the page works at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const { calls } = await signIn(page);
  await page.goto("/products/suppliers?request=2");
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("textbox", { name: "kgCO₂e per kg" }).fill("7.9");
  await drawer.getByTestId("confirm-boundary").check();
  await drawer.getByRole("button", { name: "Accept figure" }).click();
  await expect(page.getByText("Supplier figure accepted")).toBeVisible();
  expect(calls.find((c) => c.path.endsWith("/accept"))?.body).toMatchObject({ value_kgco2e: 7.9, boundary: "cradle_to_grave", confirm_boundary: true });
});

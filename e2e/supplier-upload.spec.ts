import { expect, test } from "@playwright/test";

/**
 * C06 supplier upload page smoke tests: `/supplier/:token` has no account; it
 * shows what is asked for, takes a file or typed values, and says when the
 * link is dead. ESG-lite answers from fixtures.
 */

const openRequest = {
  company: "Midal Cables",
  product: "EC-grade wire rod 9.5 mm",
  material: "EC-grade aluminium ingot",
  unit: "kg",
  boundary: "cradle_to_gate",
  due_date: "2099-06-30",
  supplier_name: "Alba",
  status: "opened",
  received_at: null,
  reply: null,
};

test("a supplier sends a file and a value, and sees the thank-you", async ({ page }) => {
  const posted: { fields: Record<string, string>; fileName: string | null }[] = [];
  await page.route(
    (url) => url.port !== "4173",
    async (route) => {
      const url = new URL(route.request().url());
      const m = /\/public\/supplier-requests\/([^/]+)(?:\/submit)?$/.exec(url.pathname);
      if (!m) return route.fulfill({ status: 404, json: { message: "Not found" } });
      if (m[1] === "gone") return route.fulfill({ status: 410, json: { message: "This link has expired" } });
      if (m[1] !== "tok") return route.fulfill({ status: 404, json: { message: "Not found" } });
      if (route.request().method() === "POST") {
        const body = route.request().postDataBuffer()?.toString("latin1") ?? "";
        const fields: Record<string, string> = {};
        for (const m of body.matchAll(/name="([^"]+)"\r\n\r\n([^\r]*)\r\n/g)) fields[m[1]] = m[2];
        posted.push({ fields, fileName: /filename="([^"]+)"/.exec(body)?.[1] ?? null });
        return route.fulfill({
          json: {
            ...openRequest,
            status: "received",
            received_at: "2025-05-03T10:00:00.000Z",
            reply: { value_kgco2e: 7.85, unit: "kg", boundary: "cradle_to_gate", standard: "ISO 14067", reference_start: null, reference_end: null, valid_from: null, valid_to: null, verifier: null, file: { name: "alba-epd.pdf", size: 13 } },
            message: "Thank you",
          },
        });
      }
      return route.fulfill({ json: openRequest });
    },
  );

  await page.goto("/supplier/tok");
  await expect(page.getByRole("heading", { name: "Cradle-to-gate (A1–A3) footprint of EC-grade aluminium ingot" })).toBeVisible();
  await expect(page.getByText("Midal Cables asks for")).toBeVisible();
  await expect(page.getByText("Wanted by 30 June 2099")).toBeVisible();
  // Nothing to send yet.
  await page.getByRole("button", { name: "Send to Midal Cables" }).click();
  await expect(page.getByRole("alert")).toHaveText("Upload your declaration or type the value.");

  await page.locator('input[type="file"]').setInputFiles({ name: "alba-epd.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  await page.getByRole("textbox", { name: "Value" }).fill("7.85");
  await page.getByRole("combobox", { name: /System boundary/ }).selectOption("cradle_to_gate");
  await page.getByRole("textbox", { name: "Standard" }).fill("ISO 14067");
  await page.getByRole("button", { name: "Send to Midal Cables" }).click();

  await expect(page.getByText("Thank you, your data was received.")).toBeVisible();
  await expect(page.getByText("7.85 kg CO₂e per kg")).toBeVisible();
  await expect(page.getByText("alba-epd.pdf")).toBeVisible();
  expect(posted).toHaveLength(1);
  expect(posted[0].fileName).toBe("alba-epd.pdf");
  expect(posted[0].fields).toMatchObject({ value_kgco2e: "7.85", unit: "kg", boundary: "cradle_to_gate", standard: "ISO 14067" });

  // A correction reopens the form.
  await page.getByRole("button", { name: "Send a correction" }).click();
  await expect(page.getByRole("button", { name: "Send to Midal Cables" })).toBeVisible();
});

test("an expired or unknown link says so, without a form", async ({ page }) => {
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/public/supplier-requests/gone")) return route.fulfill({ status: 410, json: { message: "This link has expired" } });
      return route.fulfill({ status: 404, json: { message: "Not found" } });
    },
  );
  await page.goto("/supplier/gone");
  await expect(page.getByText("This link has expired.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Send to/ })).toHaveCount(0);

  await page.goto("/supplier/nope");
  await expect(page.getByText("This link isn't valid.")).toBeVisible();
  await expect(page.getByText("Powered by")).toBeVisible();
});

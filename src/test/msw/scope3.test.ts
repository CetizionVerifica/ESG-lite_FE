import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import type { Scope3ErrorBody } from "../../lib/scope3/contracts";
import { type Scope3CategoryRow, resetScope3Mocks, scope3Handlers } from "./scope3";

const server = setupServer(...scope3Handlers);
const API = "http://api.test";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetScope3Mocks());
afterAll(() => server.close());

const put = (path: string, body: unknown) =>
  fetch(`${API}${path}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const post = (path: string, body: unknown) =>
  fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("Scope 3 mock handlers", () => {
  it("lists the 15 categories with the company's status, a reason for each one left out", async () => {
    const rows = (await (await fetch(`${API}/scope3/categories`)).json()) as Scope3CategoryRow[];
    expect(rows.map((r) => r.ghg_category)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    for (const r of rows.filter((x) => x.status === "excluded" || x.status === "not_relevant")) expect(r.reason).toBeTruthy();
  });

  it("refuses to exclude a category without a reason, and saves it with one", async () => {
    const bad = await put("/scope3/categories/2", { status: "excluded" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as Scope3ErrorBody).code).toBe("EXCLUSION_REASON_REQUIRED");

    const ok = await put("/scope3/categories/2", { status: "excluded", reason: "No capital purchases this year." });
    expect(ok.status).toBe(200);
    const rows = (await (await fetch(`${API}/scope3/categories`)).json()) as Scope3CategoryRow[];
    expect(rows.find((r) => r.ghg_category === 2)).toMatchObject({ status: "excluded", reason: "No capital purchases this year." });
  });

  it("starts each test from the sample data", async () => {
    const rows = (await (await fetch(`${API}/scope3/categories`)).json()) as Scope3CategoryRow[];
    expect(rows.find((r) => r.ghg_category === 2)?.status).toBe("included");
  });

  it("only takes cradle-to-gate supplier figures", async () => {
    const bad = await post("/suppliers/1/factors", { item: "Rod", unit: "kg", kgco2e_per_unit: 4, boundary: "cradle_to_grave", reference_year: 2025, gwp_set: "AR6" });
    expect(((await bad.json()) as Scope3ErrorBody).code).toBe("SUPPLIER_FACTOR_BOUNDARY");
    const ok = await post("/suppliers/1/factors", { item: "Rod", unit: "kg", kgco2e_per_unit: 4, boundary: "cradle_to_gate", reference_year: 2025, gwp_set: "AR6" });
    expect(ok.status).toBe(201);
  });

  it("answers FX, screening, report, base year, recalculation, submit and lock calls", async () => {
    expect((await fetch(`${API}/fx-rates?currency=EUR&date=2026-09-30`)).status).toBe(200);
    expect(((await (await fetch(`${API}/fx-rates?currency=XYZ&date=2026-09-30`)).json()) as Scope3ErrorBody).code).toBe("CURRENCY_NOT_SUPPORTED");
    expect((await fetch(`${API}/scope3/screening?year=2026`)).status).toBe(200);
    expect((await fetch(`${API}/reports/ghg/scope3?year=2026`)).status).toBe(200);
    expect((await fetch(`${API}/scope3/base-year`)).status).toBe(200);
    expect(((await (await post("/scope3/recalculations", { affected_years: [2023] })).json()) as Scope3ErrorBody).code).toBe("RECALCULATION_REASON_REQUIRED");
    expect((await post("/user/emissions/submit", { ids: [1, 2] })).status).toBe(200);
    expect(((await (await post("/periods/unlock", { site_id: 1, year: 2026, month: 8 })).json()) as Scope3ErrorBody).code).toBe("UNLOCK_REASON_REQUIRED");
    expect((await post("/periods/unlock", { site_id: 1, year: 2026, month: 8, reason: "Late invoice" })).status).toBe(200);
  });
});

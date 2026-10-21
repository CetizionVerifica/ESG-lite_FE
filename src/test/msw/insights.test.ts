import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { PANEL_PATHS, type Bridge, type Cards, type PanelId, type PanelResponse, type Summary } from "../../lib/insights/contracts";
import { handlers, insightsMockEvents, resetInsightsMocks, setInsightsMockEnabled, setInsightsMockKpi, setInsightsMockPanel, setInsightsMockRole } from "./index";

const server = setupServer(...handlers);
const API = "http://api.test";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetInsightsMocks());
afterAll(() => server.close());

const json = async <T = unknown>(method: string, path: string, body?: unknown) => {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, body: (res.status === 204 ? null : type.includes("json") ? await res.json() : await res.text()) as T };
};

/** Every 01-contracts §4 endpoint with a body that works. */
const ENDPOINTS: [string, string, unknown?][] = [
  ["GET", "/insights/sites"],
  ...Object.values(PANEL_PATHS).map((p): [string, string] => ["GET", `/insights${p}?year=2026`]),
  ["GET", "/insights/decoupling?years=5"],
  ["GET", "/insights/cards?ai=1"],
  ["GET", "/insights/bridge?compare=base"],
  ["GET", "/insights/events?from=2023-01-01&to=2026-12-31"],
  ["POST", "/insights/events", { date: "2026-03-01", label: "Heat pump", kind: "initiative" }],
  ["PATCH", "/insights/events/1", { label: "Rooftop solar, phase 1" }],
  ["DELETE", "/insights/events/2"],
  ["GET", "/insights/snapshot.pdf?year=2026"],
];

describe("insights mocks (IN-0)", () => {
  it("answers every endpoint while on", async () => {
    for (const [method, path, body] of ENDPOINTS) {
      resetInsightsMocks();
      const r = await json(method, path, body);
      expect(r.status, `${method} ${path}`).toBeLessThan(300);
    }
  });

  it("status answers while off; everything else is IN_OFF", async () => {
    setInsightsMockEnabled(false);
    expect((await json("GET", "/insights/status")).body).toEqual({ enabled: false, kpi_tracking: true });
    for (const [method, path, body] of ENDPOINTS) {
      const r = await json<{ code: string }>(method, path, body);
      expect([r.status, r.body.code], `${method} ${path}`).toEqual([403, "IN_OFF"]);
    }
  });

  it("Users get IN_FORBIDDEN", async () => {
    setInsightsMockRole("User");
    const r = await json<{ code: string }>("GET", "/insights/summary");
    expect([r.status, r.body.code]).toEqual([403, "IN_FORBIDDEN"]);
  });

  it("wraps every panel in the envelope, with the period label and pending counts", async () => {
    for (const [panel, path] of Object.entries(PANEL_PATHS) as [PanelId, string][]) {
      const r = await json<PanelResponse<unknown>>("GET", `/insights${path}?year=2025&yearType=FY&sites=13`);
      expect(r.body.panel).toBe(panel);
      expect(r.body.availability).toBe("ok");
      expect(r.body.period).toEqual({ year: 2025, yearType: "FY" });
      expect(r.body.sites).toEqual([13]);
      expect(r.body.label).toBe("FY 2025 · Pune plant");
      expect(r.body.pending_not_in).toEqual({ emissions: 12, kpi_values: 3, link: "/data/approvals" });
      expect(r.body.data).not.toBeNull();
    }
  });

  it("KPI tracking off: KPI panels say kpi_off, the summary has no readiness, the wall is SBTi only", async () => {
    setInsightsMockKpi(false);
    for (const path of ["/insights/esg-ring", "/insights/materiality"]) {
      const r = await json<PanelResponse<unknown>>("GET", path);
      expect([r.status, r.body.availability, r.body.data], path).toEqual([200, "kpi_off", null]);
    }
    const s = await json<PanelResponse<Summary>>("GET", "/insights/summary");
    expect(s.body.data?.readiness).toBeNull();
    const wall = await json<PanelResponse<{ items: { source: string }[] }>>("GET", "/insights/target-wall");
    expect(wall.body.data?.items.every((i) => i.source === "sbti")).toBe(true);
    const flow = await json<PanelResponse<{ nodes: { kind: string }[] }>>("GET", "/insights/flow");
    expect(flow.body.data?.nodes.some((n) => n.kind === "disclosure")).toBe(false);
  });

  it("bad queries: IN_VALIDATION; a site that isn't the caller's: IN_SITE_NOT_FOUND", async () => {
    expect((await json<{ code: string }>("GET", "/insights/summary?sites=1,,2")).body.code).toBe("IN_VALIDATION");
    expect((await json<{ code: string }>("GET", "/insights/summary?yearType=QY")).body.code).toBe("IN_VALIDATION");
    expect((await json<{ code: string }>("GET", "/insights/summary?pillar=E")).body.code).toBe("IN_VALIDATION");
    const r = await json<{ code: string }>("GET", "/insights/summary?sites=99");
    expect([r.status, r.body.code]).toEqual([404, "IN_SITE_NOT_FOUND"]);
  });

  it("one panel can be empty or fail on its own", async () => {
    setInsightsMockPanel("decoupling", { availability: "no_data", reason: "Add production data for 2024 and 2025 to see decoupling." });
    setInsightsMockPanel("bridge", { error: 500 });
    const d = await json<PanelResponse<unknown>>("GET", "/insights/decoupling");
    expect([d.body.availability, d.body.reason, d.body.data]).toEqual(["no_data", "Add production data for 2024 and 2025 to see decoupling.", null]);
    expect((await json("GET", "/insights/bridge")).status).toBe(500);
    expect((await json<PanelResponse<unknown>>("GET", "/insights/summary")).body.availability).toBe("ok");
  });

  it("the fixture bridge is consistent: its steps add up to the change (as the server promises)", async () => {
    const b = (await json<PanelResponse<Bridge>>("GET", "/insights/bridge")).body.data!;
    const sum = b.steps.reduce((a, s) => a + s.value, 0);
    expect(Math.abs(sum - (b.to.value - b.from.value))).toBeLessThan(1e-6);
  });

  it("events are stateful and validated", async () => {
    const made = await json<{ id: number }>("POST", "/insights/events", { date: "2026-03-01", label: " Heat pump ", kind: "initiative", site_id: 11 });
    expect(made.status).toBe(201);
    expect(insightsMockEvents().find((e) => e.id === made.body.id)).toEqual({ id: made.body.id, date: "2026-03-01", label: "Heat pump", kind: "initiative", site_id: 11 });
    expect((await json<{ code: string }>("POST", "/insights/events", { date: "2026-03-01", label: "x".repeat(61), kind: "initiative" })).body.code).toBe("IN_EVENT_INVALID");
    expect((await json<{ code: string }>("POST", "/insights/events", { date: "2026-03-01", label: "x", kind: "merger" })).body.code).toBe("IN_EVENT_INVALID");
    expect((await json<{ code: string }>("PATCH", "/insights/events/999", { label: "x" })).body.code).toBe("IN_EVENT_NOT_FOUND");
    expect((await json("DELETE", `/insights/events/${made.body.id}`)).status).toBe(204);
    expect(insightsMockEvents().some((e) => e.id === made.body.id)).toBe(false);
    const pathway = await json<PanelResponse<{ events: unknown[] }>>("GET", "/insights/pathway");
    expect(pathway.body.data?.events.length).toBe(insightsMockEvents().length);
  });

  it("IN-9: cards with ?ai=1 are the same cards, some reworded with tokens; without it all are rule text", async () => {
    const plain = (await json<PanelResponse<Cards>>("GET", "/insights/cards")).body.data!.cards;
    expect(plain.every((c) => c.source === "rule" && c.text === undefined)).toBe(true);
    const ai = (await json<PanelResponse<Cards>>("GET", "/insights/cards?ai=1")).body.data!.cards;
    expect(ai.map((c) => [c.id, c.params, c.link])).toEqual(plain.map((c) => [c.id, c.params, c.link]));
    const reworded = ai.filter((c) => c.source === "ai");
    expect(reworded.map((c) => c.id).sort()).toEqual(["decoupling", "largest_source", "pathway_gap", "renewables_jump"]);
    expect(ai.find((c) => c.id === "decoupling")?.text).toBe("Since {{v:base_year}}, output grew {{v:output_pct}}% and emissions dropped {{v:emissions_pct}}%.");
    expect(ai.find((c) => c.id === "renewables_jump")?.text).toMatch(/\d/);
  });
});

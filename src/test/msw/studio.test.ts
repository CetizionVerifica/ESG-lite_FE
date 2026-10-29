import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import type { ReportDoc, StudioDocResponse, StudioDocSummary } from "../../lib/studio/contracts";
import { handlers, resetStudioMocks, setStudioMockEnabled, setStudioMockKpi, studioMockDoc } from "./index";
import { renderData, renderSheet, type RenderBinding, type RenderDoc, type RenderFreeformPage, type RenderValue } from "../../lib/studio/render";
import ghgRenderFixture from "../fixtures/studio-render/ghg-fixture.json";

const server = setupServer(...handlers);
const API = "http://api.test";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetStudioMocks());
afterAll(() => server.close());

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const json = async <T = unknown>(method: string, path: string, body?: unknown) => {
  const res = await send(method, path, body);
  return { status: res.status, body: (res.status === 204 ? null : res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text()) as T };
};

/** Every 01-contracts §4 endpoint (ids from the sample), with a body that works. */
const ENDPOINTS: [string, string, unknown?][] = [
  ["GET", "/studio/readiness?kind=ghg&year=2025"],
  ["GET", "/studio/brand-kit"],
  ["PUT", "/studio/brand-kit", { voice: "Plain and warm." }],
  ["GET", "/studio/styles?kind=ghg"],
  ["GET", "/studio/templates?kind=ghg"],
  ["GET", "/studio/templates/1"],
  ["GET", "/studio/layouts?kind=ghg"],
  ["GET", "/studio/elements?group=data"],
  ["POST", "/studio/assets", {}],
  ["GET", "/studio/assets"],
  ["DELETE", "/studio/assets/a-plant"],
  ["POST", "/studio/resolve", { kind: "ghg", year: 2025, yearType: "CY", sites: "all", bindings: [], tokens: [] }],
  ["GET", "/studio/docs/1/inputs"],
  ["PATCH", "/studio/docs/1/inputs", { rev: 1, inputs: {} }],
  ["GET", "/studio/inputs/prefill?kind=ghg&year=2025"], // DS-2
  ["GET", "/studio/data?kind=ghg&year=2025"], // DS-2
  ["GET", "/studio/materiality"], // DS-2
  ["PUT", "/studio/materiality", { scores: [{ esrs_topic: "S1", impact_score: 5, financial_score: 4 }] }], // DS-2
  ["GET", "/studio/docs?kind=ghg"],
  ["POST", "/studio/docs", { kind: "ghg", templateId: 1, year: 2025, yearType: "CY", sites: "all", frameworks: ["GHGP"], inputs: {}, ai: false }],
  ["GET", "/studio/docs/1"],
  ["POST", "/studio/docs/1/rebuild", { keepUserEdits: true }],
  ["POST", "/studio/docs/1/presence"],
  ["POST", "/studio/docs/1/duplicate", { title: "Copy" }],
  ["POST", "/studio/docs/1/resize", { format: "slide_16_9", purpose: "deck", title: "Board brief" }],
  ["GET", "/studio/docs/1/preview.html?mode=sheet"],
  ["POST", "/studio/docs/1/jobs", { kind: "proof", rev: 3 }],
  ["GET", "/studio/jobs/1"],
  ["GET", "/studio/docs/1/versions"],
  ["POST", "/studio/docs/1/versions", { note: "Before review" }],
  ["POST", "/studio/docs/1/shares", { jobId: 1, expiresInDays: 14 }], // DS-11: a link to the proof above
  ["GET", "/studio/docs/1/shares"],
  ["POST", "/studio/docs/1/ai", { action: "ghg_exec_summary", target: { pageId: "p-summary" } }],
  ["POST", "/studio/docs/1/ai/chat", { messages: [{ role: "user", text: "Shorter" }] }],
  ["GET", "/studio/docs/1/ai/usage"],
  ["POST", "/studio/docs/1/checks", { rev: 3 }],
  ["GET", "/studio/docs/1/drift"],
  ["POST", "/studio/docs/1/comments", { pageId: "p-cover", body: "Check the photo" }],
  ["GET", "/studio/docs/1/comments"],
  ["POST", "/studio/comments/1/task", { assigneeId: 2 }],
  ["PATCH", "/studio/comments/1/task", { done: true }],
  ["PATCH", "/studio/comments/1", { resolved: true }],
  ["POST", "/studio/docs/1/approvals", { reviewerId: 2, rev: 3 }], // DS-13: tied to the rev
  ["POST", "/studio/approvals/1/decide", { decision: "approve" }],
  ["DELETE", "/studio/approvals/1"],
  ["GET", "/studio/docs/1/people"], // DS-13
  ["GET", "/studio/docs/1/approvals"], // DS-13
  ["GET", "/studio/review-settings"], // DS-13
  ["PUT", "/studio/review-settings", { requireReview: true }], // DS-13
  ["GET", "/studio/docs/1/versions/1/preview.html?mode=paged"], // DS-13
  ["DELETE", "/studio/comments/1"], // DS-13
  ["DELETE", "/studio/shares/1"],
  ["POST", "/studio/docs/1/versions/1/restore"],
  ["POST", "/studio/templates/from-doc", { docId: 1, name: "Our inventory" }],
  ["POST", "/studio/layouts/from-page", { docId: 1, pageId: "p-cover", name: "Our cover", kind: "cover" }],
  ["GET", "/studio/fonts/source-sans-3.woff2"],
  ["DELETE", "/studio/docs/2"],
];

describe("studio mocks (01-contracts §4)", () => {
  it("answers /status from the switches", async () => {
    expect((await json("GET", "/studio/status")).body).toEqual({ enabled: true, kinds: { ghg: true, sustainability: true } });
    setStudioMockKpi(false);
    expect((await json("GET", "/studio/status")).body).toEqual({ enabled: true, kinds: { ghg: true, sustainability: false } });
    setStudioMockEnabled(false);
    expect((await json("GET", "/studio/status")).body).toEqual({ enabled: false, kinds: { ghg: false, sustainability: false } });
  });

  it("answers every endpoint while the switch is on", async () => {
    for (const [method, path, body] of ENDPOINTS) {
      const res = await json(method, path, body);
      expect(res.status, `${method} ${path}: ${JSON.stringify(res.body)}`).toBeLessThan(300);
    }
  });

  it("answers DS_STUDIO_OFF on every endpoint but /status while the switch is off", async () => {
    setStudioMockEnabled(false);
    for (const [method, path, body] of [...ENDPOINTS, ["GET", "/studio/nothing-here"] as [string, string]]) {
      const res = await json<{ code: string }>(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.code, `${method} ${path}`).toBe("DS_STUDIO_OFF");
    }
  });

  it("serves one GHG doc and one sustainability doc from the fixtures", async () => {
    const list = await json<StudioDocSummary[]>("GET", "/studio/docs");
    expect(list.body.map((d) => [d.id, d.kind, d.format])).toEqual([
      [1, "ghg", "a4"],
      [2, "sustainability", "a4"],
    ]);
    const ghg = await json<StudioDocResponse>("GET", "/studio/docs/1");
    expect(ghg.body.doc.meta.frameworks).toEqual(["GHGP", "ISO14064"]);
    expect((await json<StudioDocSummary[]>("GET", "/studio/docs?kind=sustainability")).body.map((d) => d.id)).toEqual([2]);
  });

  it("answers DS_KIND_OFF for the sustainability kind while KPI tracking is off", async () => {
    setStudioMockKpi(false);
    expect((await json<{ code: string }>("GET", "/studio/docs/2")).body.code).toBe("DS_KIND_OFF");
    expect((await json<{ code: string }>("GET", "/studio/readiness?kind=sustainability")).body.code).toBe("DS_KIND_OFF");
    expect((await json<{ code: string }>("POST", "/studio/docs", { kind: "sustainability", templateId: 5, year: 2025 })).body.code).toBe("DS_KIND_OFF");
    expect((await json<StudioDocSummary[]>("GET", "/studio/docs")).body.map((d) => d.kind)).toEqual(["ghg"]);
    expect((await json("GET", "/studio/docs/1")).status).toBe(200);
  });

  it("saves with an optimistic rev: a stale rev is 409 DS_VERSION_CONFLICT", async () => {
    const { body } = await json<StudioDocResponse>("GET", "/studio/docs/1");
    const doc: ReportDoc = { ...body.doc, meta: { ...body.doc.meta, title: "Renamed" } };
    const saved = await json<StudioDocResponse>("PATCH", "/studio/docs/1", { rev: body.rev, doc });
    expect(saved.status).toBe(200);
    expect(saved.body.rev).toBe(body.rev + 1);
    expect(studioMockDoc(1)?.doc.meta.title).toBe("Renamed");
    const stale = await json<{ code: string; details: { rev: number } }>("PATCH", "/studio/docs/1", { rev: body.rev, doc });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: "DS_VERSION_CONFLICT", details: { rev: body.rev + 1 } });
  });

  it("creates, duplicates and resizes into new docs; resize links its source", async () => {
    const created = await json<StudioDocResponse>("POST", "/studio/docs", { kind: "ghg", templateId: 4, year: 2024, yearType: "FY" });
    expect(created.status).toBe(201);
    expect(created.body.doc.purpose).toBe("summary");
    expect(created.body.doc.meta.year).toBe(2024);
    const resized = await json<{ id: number }>("POST", "/studio/docs/1/resize", { format: "square", purpose: "social", title: "Post" });
    expect(studioMockDoc(resized.body.id)?.doc.source?.docId).toBe(1);
    expect(studioMockDoc(resized.body.id)?.doc.format).toBe("square");
  });

  it("resolves bindings to display strings, market-based Scope 2 as unavailable", async () => {
    const res = await json<{ values: { display: string }[]; unavailable: { bindingIdx: number }[] }>("POST", "/studio/resolve", {
      kind: "ghg",
      bindings: [
        { source: "ghg", metric: "total", years: { last: 1 }, sites: "all" },
        { source: "ghg", metric: "scope2_market", years: { last: 1 }, sites: "all" },
        { source: "custom", columns: ["a"], rows: [[1]] },
      ],
      tokens: [],
    });
    expect(res.body.values.map((v) => v.display)).toEqual(["1,000.000", "Not reported", "Unlinked data"]); // #209: tCO₂e with 3 decimals
    expect(res.body.unavailable).toEqual([{ bindingIdx: 1, reason: "NOT_RECORDED" }]); // DS-2: a reason code
  });

  it("#209 review: series carry their own unit as the server sends it, and the renderer prints each in it", async () => {
    const gas = { source: "ghg", metric: "total", years: { last: 1 }, sites: "all", breakdown: "gas" } as const;
    const kpis = { source: "kpi", kpis: ["GHG_SCOPE1", "WATER_WITHDRAWAL", "ENERGY_TOTAL"], years: { last: 1 }, sites: "all" } as const;
    const res = await json<{ values: RenderValue[] }>("POST", "/studio/resolve", { kind: "sustainability", year: 2025, yearType: "CY", sites: "all", bindings: [gas, kpis], tokens: [] });
    const [g, k] = res.body.values;
    // A gas breakdown: tonnes of each gas ("t", src/studio/sources/ghg.ts GAS_TONNES); the binding stays tCO₂e.
    expect(g.unit).toBe("tCO₂e");
    expect(g.series?.map((s) => s.unit)).toEqual(["t"]);
    // Several KPIs: the value is in the first KPI's unit; one series per KPI, each in its own (src/studio/sources/kpi.ts).
    expect(k).toMatchObject({ unit: "tCO₂e", display: "1,111.000" });
    expect(k.series?.map((s) => [s.label, s.unit])).toEqual([
      ["Scope 1 emissions", "tCO₂e"],
      ["Water withdrawn", "m³"],
      ["Energy consumed", "MWh"],
    ]);

    // Through the mirror: gas parts keep `auto` (8,350 / 19.8 / 2.9, the mock's 2025 parts), and the bound
    // table prints only the tCO₂e row with 3 decimals (1,111.000; 1,112 m³; 1,113 MWh).
    const doc = JSON.parse(JSON.stringify(ghgRenderFixture.doc)) as RenderDoc;
    const page = doc.pages[0] as RenderFreeformPage;
    const frame = { x: 10, y: 10, w: 90, h: 60, rotation: 0 };
    page.elements = [
      { id: "u.gas", type: "chart", frame, z: 1, source: "user", props: { binding: gas, kind: "gas_split", options: {} } },
      { id: "u.table", type: "table", frame: { ...frame, y: 100 }, z: 2, source: "user", props: { binding: kpis, style: "lined", totalRow: false } },
    ] as unknown as RenderFreeformPage["elements"];
    const html = renderSheet(page, doc, renderData([gas, kpis] as unknown as RenderBinding[], [], res.body), { mode: "sheet" }).html;
    const chart = html.slice(html.indexOf('data-ghg-chart="gas_split"'), html.indexOf("<table"));
    for (const label of [">8,350<", ">19.8<", ">2.9<"]) expect(chart, label).toContain(label);
    expect(chart).not.toMatch(/>(8,350|19\.8|2\.9)00</);
    const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
    expect(table).toContain(">1,111.000<");
    expect(table).toContain(">1,112<");
    expect(table).toContain(">1,113<");
    expect(table).not.toMatch(/>1,11[23]\.000</);
  });

  it("makes a final as a version through a render job; the draft stays editable (DS-11)", async () => {
    const job = await json<{ id: number; status: string }>("POST", "/studio/docs/1/jobs", { kind: "final", rev: 1 });
    expect(job.status).toBe(202);
    expect(job.body.status).toBe("queued");
    const done = await json<{ status: string; versionN: number; downloadUrl: string }>("GET", `/studio/jobs/${job.body.id}`);
    expect(done.body).toMatchObject({ status: "done", versionN: 1, downloadUrl: `/studio/jobs/${job.body.id}/file` });
    expect((await json("PATCH", "/studio/docs/1", { rev: 1, doc: studioMockDoc(1)?.doc })).status).toBe(200);
    const pdf = await send("GET", `/studio/docs/1/versions/1/pdf`);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    // A second final needs a note.
    expect((await json<{ code: string }>("POST", "/studio/docs/1/jobs", { kind: "final", rev: 2 })).body.code).toBe("DS_VALIDATION");
  });

  it("an unknown doc is 404 DS_DOC_NOT_FOUND", async () => {
    expect((await json<{ code: string }>("GET", "/studio/docs/99")).body.code).toBe("DS_DOC_NOT_FOUND");
  });
});

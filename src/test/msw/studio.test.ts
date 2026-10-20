import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import type { ReportDoc, StudioDocResponse, StudioDocSummary } from "../../lib/studio/contracts";
import { handlers, resetStudioMocks, setStudioMockEnabled, setStudioMockKpi, studioMockDoc } from "./index";

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
  ["POST", "/studio/docs/1/shares", { versionId: 1, expiresInDays: 14 }],
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
  ["POST", "/studio/docs/1/approvals", { reviewerId: 2 }],
  ["POST", "/studio/approvals/1/decide", { decision: "approved" }],
  ["DELETE", "/studio/approvals/1"],
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
    expect(res.body.values.map((v) => v.display)).toEqual(["1,000", "Not reported", "Unlinked data"]);
    expect(res.body.unavailable).toEqual([{ bindingIdx: 1, reason: "NOT_RECORDED" }]); // DS-2: a reason code
  });

  it("makes a final as a version and freezes the doc", async () => {
    const job = await json<{ versionId: number; status: string }>("POST", "/studio/docs/1/jobs", { kind: "final", rev: 1 });
    expect(job.body).toMatchObject({ status: "done", versionId: 1 });
    expect((await json<{ code: string }>("PATCH", "/studio/docs/1", { rev: 1, doc: studioMockDoc(1)?.doc })).body.code).toBe("DS_FINAL_IMMUTABLE");
    const pdf = await send("GET", `/studio/docs/1/versions/1/pdf`);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
  });

  it("an unknown doc is 404 DS_DOC_NOT_FOUND", async () => {
    expect((await json<{ code: string }>("GET", "/studio/docs/99")).body.code).toBe("DS_DOC_NOT_FOUND");
  });
});

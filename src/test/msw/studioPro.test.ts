import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import type { BrandFont, BrandFontsResponse, ImageJob, StudioAsset, StudioDocResponse, Suggestion, TemplateSuggestResponse, TemplateSwapPreview } from "../../lib/studio/contracts";
import { handlers } from "./index";
import { resetStudioMocks, setStudioMockBgRemover, setStudioMockBrandKit, setStudioMockEnabled, setStudioMockKpi, setStudioMockTemplateAi, studioMockDoc, studioMockFonts } from "./studio";

/**
 * PRO-0: the mocks for the Pro editing and AI template endpoints (AT-1, AT-2,
 * PE-1, PE-2) answer in the contract shapes, gate like the backend, and keep
 * state (a swap saves a new rev, a background removal adds a derived asset,
 * a font upload joins its family).
 */
const server = setupServer(...handlers);
const API = "http://api.test";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetStudioMocks());
afterAll(() => server.close());

const json = async <T = unknown>(method: string, path: string, body?: unknown) => {
  const res = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (res.status === 204 ? null : res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text()) as T };
};
const upload = async (fields: Record<string, string>, bytes: number[] = [0x77, 0x4f, 0x46, 0x32, 0, 0]) => {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], "font.woff2"));
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${API}/studio/brand-kit/fonts`, { method: "POST", body: form });
  return { status: res.status, body: (await res.json()) as BrandFont & { code?: string } };
};

const BRIEF = { kind: "ghg", year: 2025, brief: { purpose: "ghg_inventory", frameworks: ["ISO14064"], audience: "verifier", length: "medium", note: "Formal, base year 2023." } };

const PRO_ENDPOINTS: [string, string, unknown?][] = [
  ["POST", "/studio/templates/suggest", BRIEF],
  ["POST", "/studio/docs/1/template-swap/preview", { templateId: 2, rev: 1 }],
  ["POST", "/studio/docs/1/template-swap/apply", { templateId: 2, rev: 1, previewHash: "mock:1:1:2" }],
  ["POST", "/studio/assets/a-plant/remove-background", {}],
  ["GET", "/studio/image-jobs/1"],
  ["GET", "/studio/brand-kit/fonts"],
  ["DELETE", "/studio/brand-kit/fonts/1"],
  ["GET", "/studio/brand-kit/fonts/1/files/font-1"],
];

describe("PRO-0 studio mocks", () => {
  it("gate every PRO endpoint like the backend (DS_STUDIO_OFF)", async () => {
    setStudioMockEnabled(false);
    for (const [method, path, body] of PRO_ENDPOINTS) {
      const r = await json<{ code: string }>(method, path, body);
      expect([path, r.status, r.body.code]).toEqual([path, 403, "DS_STUDIO_OFF"]);
    }
  });

  it("AT-1: a ranked shortlist of up to 3 with readiness counts and reasons; rule order without AI", async () => {
    const r = await json<TemplateSuggestResponse>("POST", "/studio/templates/suggest", BRIEF);
    expect(r.status).toBe(200);
    expect(r.body.aiUsed).toBe(true);
    expect(r.body.shortlist.length).toBeLessThanOrEqual(3);
    expect(r.body.shortlist.map((s) => s.rank)).toEqual(r.body.shortlist.map((_, i) => i + 1));
    expect(r.body.shortlist.every((s) => s.template.kind === "ghg" && s.reasons.length >= 1)).toBe(true);
    expect(r.body.shortlist[0].readiness.badges.find((b) => b.key === "scope3_categories")).toMatchObject({ have: 9, of: 15, status: "partial" });
    setStudioMockTemplateAi(false);
    const plain = await json<TemplateSuggestResponse>("POST", "/studio/templates/suggest", BRIEF);
    expect([plain.body.aiUsed, plain.body.model, plain.body.shortlist.every((s) => s.reasons.length === 0)]).toEqual([false, null, true]);
    expect((await json<{ code: string }>("POST", "/studio/templates/suggest", { ...BRIEF, brief: { ...BRIEF.brief, audience: "staff" } })).body.code).toBe("DS_VALIDATION");
    setStudioMockKpi(false);
    expect((await json<{ code: string }>("POST", "/studio/templates/suggest", { ...BRIEF, kind: "sustainability" })).body.code).toBe("DS_KIND_OFF");
  });

  it("AT-2: suggest_layouts answers 3 page options that keep every element", async () => {
    const page = studioMockDoc(1)!.doc.pages.find((p) => p.kind === "freeform")!;
    const r = await json<Suggestion>("POST", "/studio/docs/1/ai", { action: "suggest_layouts", target: { pageId: page.id } });
    expect(r.status).toBe(200);
    expect(r.body.kind).toBe("pages");
    expect(r.body.payload.pages).toHaveLength(3);
    expect(r.body.payload.layoutOptions?.map((o) => o.id)).toEqual(["A", "B", "C"]);
    const ids = page.kind === "freeform" ? page.elements.map((e) => e.id).sort() : [];
    for (const p of r.body.payload.pages ?? []) expect([p.id, p.elements.map((e) => e.id).sort()]).toEqual([page.id, ids]);
  });

  it("AT-2: template swap previews without saving, applies with the preview hash, and refuses a stale one", async () => {
    const p = await json<TemplateSwapPreview>("POST", "/studio/docs/1/template-swap/preview", { templateId: 2, rev: 1 });
    expect(p.status).toBe(200);
    expect(p.body.doc.design.templateId).toBe("2");
    expect(studioMockDoc(1)!.rev).toBe(1);
    expect((await json<{ code: string }>("POST", "/studio/docs/1/template-swap/apply", { templateId: 2, rev: 1, previewHash: "stale" })).body.code).toBe("DS_VERSION_CONFLICT");
    const a = await json<StudioDocResponse>("POST", "/studio/docs/1/template-swap/apply", { templateId: 2, rev: 1, previewHash: p.body.previewHash });
    expect([a.status, a.body.rev, studioMockDoc(1)!.doc.design.templateId]).toEqual([200, 2, "2"]);
    expect((await json<{ code: string }>("POST", "/studio/docs/1/template-swap/preview", { templateId: 5, rev: 2 })).body.code).toBe("DS_LAYOUT_NOT_FOUND");
  });

  it("PE-1: remove-background runs as a job and adds a derived asset; 503 without a model", async () => {
    const j = await json<ImageJob>("POST", "/studio/assets/a-plant/remove-background", {});
    expect([j.status, j.body.status, j.body.assetId]).toEqual([202, "queued", "a-plant"]);
    const first = await json<ImageJob>("GET", `/studio/image-jobs/${j.body.id}`);
    expect(first.body.status).toBe("running");
    const done = await json<ImageJob>("GET", `/studio/image-jobs/${j.body.id}`);
    expect(done.body.status).toBe("done");
    const assets = (await json<StudioAsset[]>("GET", "/studio/assets")).body;
    expect(assets.find((a) => a.id === done.body.resultAssetId)?.derivedFrom).toEqual({ assetId: "a-plant", op: "remove_background" });
    expect(assets.some((a) => a.id === "a-plant")).toBe(true);
    setStudioMockBgRemover(false);
    const off = await json<{ code: string; message: string }>("POST", "/studio/assets/a-plant/remove-background", {});
    expect([off.status, off.body.code, off.body.message]).toEqual([503, "DS_BG_UNAVAILABLE", "Background remover isn't set up on this server yet."]);
  });

  it("PE-2: font upload checks the licence tick, magic bytes and duplicates; files join a family; Managers only", async () => {
    expect((await upload({ family: "Midal Sans", weight: "400" })).body.code).toBe("DS_FONT_LICENCE");
    expect((await upload({ family: "Midal Sans", licenceConfirmed: "true" }, [0x50, 0x4b, 3, 4])).body.code).toBe("DS_FONT_TYPE");
    const a = await upload({ family: "Midal Sans", weight: "400", licenceConfirmed: "true" });
    expect([a.status, a.body.ref, a.body.weights]).toEqual([201, "custom:1", [400]]);
    const b = await upload({ family: "Midal Sans", weight: "700", licenceConfirmed: "true" }, [0x4f, 0x54, 0x54, 0x4f]);
    expect([b.body.id, b.body.weights, b.body.files.map((f) => f.format)]).toEqual([1, [400, 700], ["woff2", "otf"]]);
    expect((await upload({ family: "midal sans", weight: "700", licenceConfirmed: "true" })).body.code).toBe("DS_FONT_EXISTS");
    const list = await json<BrandFontsResponse>("GET", "/studio/brand-kit/fonts");
    expect([list.body.fonts.length, list.body.canEdit]).toEqual([1, true]);
    const file = await fetch(`${API}${b.body.files[1].url}`);
    expect(file.headers.get("content-type")).toBe("font/otf");
    setStudioMockBrandKit({ canEdit: false });
    expect((await upload({ family: "Other", licenceConfirmed: "true" })).body.code).toBe("DS_ROLE");
    expect((await json<{ code: string }>("DELETE", "/studio/brand-kit/fonts/1")).body.code).toBe("DS_ROLE");
    setStudioMockBrandKit({ canEdit: true });
    expect((await json("DELETE", "/studio/brand-kit/fonts/1")).status).toBe(204);
    expect(studioMockFonts()).toEqual([]);
  });
});

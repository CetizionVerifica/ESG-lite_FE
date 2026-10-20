// @vitest-environment jsdom
/**
 * DS-1 · the mirror hosted in a shadow root (the editor sheet): the same HTML
 * as the backend, isolated from app CSS, with __measure available and the
 * bundled fonts loaded through the API with the session token.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import fixture from "../../test/fixtures/studio-render/fixture-a4.json";
import { handlers, setStudioMockEnabled } from "../../test/msw";
import { renderSheet, type RenderData, type RenderDoc, type RenderFreeformPage } from "./render";
import { ensureStudioFonts, measureSheet, mountFlow, mountSheet, resetStudioFonts, studioFontPath } from "./renderHost";
import api from "../../api/axios";

const doc = fixture.doc as unknown as RenderDoc;
const data = fixture.data as unknown as RenderData;
const assets = fixture.assets;
const summary = doc.pages.find((p) => p.id === "p-summary") as RenderFreeformPage;

const server = setupServer(...handlers);
beforeAll(() => {
  api.defaults.baseURL = "http://api.test";
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  setStudioMockEnabled(true);
  resetStudioFonts();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());

describe("mountSheet", () => {
  it("draws the page in an open shadow root with exactly the renderer's HTML", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = mountSheet(host, summary, doc, data, { assets });
    expect(host.shadowRoot).toBe(root);
    const expected = renderSheet(summary, doc, data, { mode: "sheet", assets });
    const container = document.createElement("div");
    container.innerHTML = expected.html;
    expect(root.querySelector(".ds-doc")?.outerHTML).toBe(container.querySelector(".ds-doc")?.outerHTML);
    expect(root.querySelector("style")?.textContent).toContain(expected.css);
    for (const e of summary.elements) expect(root.querySelector(`[data-el-id="${e.id}"]`), e.id).not.toBeNull();
    // Isolated: nothing landed in the light DOM.
    expect(document.querySelector("[data-el-id]")).toBeNull();
    host.remove();
  });

  it("re-renders in place on the next call (one root, no duplicates)", () => {
    const host = document.createElement("div");
    mountSheet(host, summary, doc, data, { assets });
    const root = mountSheet(host, summary, doc, data, { assets, guides: true });
    expect(root.querySelectorAll(".ds-sheet")).toHaveLength(1);
    expect(root.querySelector(".ds-guides")).not.toBeNull();
  });

  it("mounts a flow section and measures a sheet", () => {
    const host = document.createElement("div");
    const section = doc.pages.find((p) => p.id === "f-s3");
    if (!section || section.kind !== "flow") throw new Error("fixture");
    const root = mountFlow(host, section, doc, data, {});
    expect(root.querySelectorAll("[data-category]")).toHaveLength(15);
    const sheetHost = document.createElement("div");
    document.body.appendChild(sheetHost);
    const sheetRoot = mountSheet(sheetHost, summary, doc, data, { assets });
    const m = measureSheet(sheetRoot);
    expect(m.map((x) => x.elementId)).toEqual(summary.elements.filter((e) => !e.hidden).sort((a, b) => a.z - b.z).map((e) => e.id));
    sheetHost.remove();
  });
});

describe("ensureStudioFonts", () => {
  it("does nothing where the FontFace API is missing", async () => {
    vi.stubGlobal("FontFace", undefined);
    expect(await ensureStudioFonts(["fraunces"], { add: vi.fn() } as unknown as FontFaceSet)).toEqual([]);
  });

  it("fetches every weight with the session token, once, and adds the faces", async () => {
    const made: { family: string; weight: string }[] = [];
    class FakeFontFace {
      constructor(
        public family: string,
        _src: ArrayBuffer,
        desc: { weight: string },
      ) {
        made.push({ family, weight: desc.weight });
      }
      load() {
        return Promise.resolve(this);
      }
    }
    vi.stubGlobal("FontFace", FakeFontFace);
    localStorage.setItem("token", "t-123");
    const seen: string[] = [];
    server.events.on("request:start", ({ request }) => {
      seen.push(`${new URL(request.url).pathname} ${request.headers.get("authorization")}`);
    });
    const set = { add: vi.fn() } as unknown as FontFaceSet;
    expect(await ensureStudioFonts(["fraunces", "source-sans-3"], set)).toEqual(["fraunces", "source-sans-3", "noto-sans"]);
    expect(made.filter((m) => m.family === "Fraunces").map((m) => m.weight)).toEqual(["400", "600", "700"]);
    expect(seen).toContain(`${studioFontPath("fraunces", 600)} Bearer t-123`);
    const calls = seen.length;
    await ensureStudioFonts(["fraunces"], set);
    expect(seen.length).toBe(calls);
    server.events.removeAllListeners();
  });

  it("reports a face that failed (switch off) and retries it next time", async () => {
    class FakeFontFace {
      load() {
        return Promise.resolve(this);
      }
    }
    vi.stubGlobal("FontFace", FakeFontFace);
    setStudioMockEnabled(false);
    const set = { add: vi.fn() } as unknown as FontFaceSet;
    expect(await ensureStudioFonts(["archivo"], set)).toEqual([]);
    setStudioMockEnabled(true);
    expect(await ensureStudioFonts(["archivo"], set)).toEqual(["archivo", "noto-sans"]);
  });
});

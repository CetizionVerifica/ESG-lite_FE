/**
 * DS-1 · the FE mirror renders byte for byte what ESG-lite renders. The
 * goldens (src/test/fixtures/studio-render, copied by npm run
 * sync:studio-render from ESG-lite ci/golden/ds/render) hold the sha256 of the
 * A4 fixture in every mode and of every format, and each element's HTML; this
 * file renders the same fixture with the mirror and compares. It also runs
 * the mirror check (hand edits to src/lib/studio/render fail here).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import fixture from "../../test/fixtures/studio-render/fixture-a4.json";
import snapshots from "../../test/fixtures/studio-render/snapshots.json";
import { RENDER_HASH, renderDocument, renderSheet, type RenderData, type RenderDoc, type RenderMode, type RenderOptions } from "./render";
import type { ReportDoc } from "./contracts";

const doc = fixture.doc as unknown as RenderDoc;
const data = fixture.data as unknown as RenderData;
const assets = fixture.assets;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const opts = (mode: RenderMode): RenderOptions => ({ mode, assets, watermark: mode === "paged" ? "PROOF" : undefined, cropMarks: mode === "print" });

describe("render mirror", () => {
  it("carries the backend's RENDER_HASH and the check passes", () => {
    expect(RENDER_HASH).toBe(snapshots.renderHash);
    const out = execFileSync(process.execPath, ["scripts/sync-studio-render.mjs", "check"], { encoding: "utf8" });
    expect(out).toContain(RENDER_HASH);
  });

  it("renders every mode of the A4 fixture byte for byte as ESG-lite does", () => {
    for (const mode of ["sheet", "paged", "present", "print"] as const) {
      const r = renderDocument(doc, data, opts(mode));
      const want = snapshots.modes[mode];
      expect({ mode, sha256: sha(r.html + "\n" + r.css), bytes: r.html.length + r.css.length }).toEqual({ mode, ...want });
    }
  });

  it("renders every format byte for byte as ESG-lite does", () => {
    const docs = fixture.docs as unknown as Record<string, RenderDoc>;
    for (const [format, want] of Object.entries(snapshots.formats)) {
      const r = renderDocument(docs[format], data, opts("sheet"));
      expect({ format, sha256: sha(r.html + "\n" + r.css), bytes: r.html.length + r.css.length }).toEqual({ format, ...want });
    }
  });

  it("renders each element's HTML exactly as the golden", () => {
    const elements: Record<string, string> = {};
    for (const page of doc.pages) {
      if (page.kind !== "freeform") continue;
      const html = renderSheet(page, doc, data, { mode: "sheet", assets }).html;
      const starts = [...html.matchAll(/<div class="ds-el [^"]*" data-el-id="([^"]+)"/g)].map((m) => ({ id: m[1], at: m.index ?? 0 }));
      starts.forEach((s, i) => {
        const end = i + 1 < starts.length ? starts[i + 1].at : html.lastIndexOf("</section>");
        elements[s.id] = html.slice(s.at, end).replace(/<div class="ds-watermark".*$/s, "");
      });
    }
    expect(Object.keys(elements).sort()).toEqual(Object.keys(snapshots.elements).sort());
    for (const [id, html] of Object.entries(snapshots.elements)) expect(elements[id], id).toBe(html);
  });

  it("accepts a contracts ReportDoc as a RenderDoc", () => {
    const asContract: ReportDoc = fixture.doc as unknown as ReportDoc;
    const renderable: RenderDoc = asContract;
    expect(renderDocument(renderable, data, { mode: "sheet" }).pageIds.length).toBe(16);
  });
});

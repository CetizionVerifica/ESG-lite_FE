import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ghgDoc from "../../test/fixtures/studio/ghg-doc.json";
import { PAGE_FORMAT_SIZES } from "./contracts";
import { RESIZE_TARGETS, resizeChapters, resizeDocument, truncateTextDoc, plainText } from "./resize";
import { RESIZE_HASH } from "./resizeHash";

/**
 * DS-10: resize.ts is ESG-lite src/studio/resize/engine.ts byte for byte (the
 * server makes the copy with it; the dialog previews with it). The mapping
 * itself is tested in ESG-lite ci/unit/ds-10-resize.test.cjs; here: the mirror
 * and that it runs on the FE's fixture doc.
 */
const doc = ghgDoc as unknown as Record<string, unknown>;
const link = { docId: 1, rev: 3, dataHash: "sha256:x" };
const run = (id: string) => {
  const t = RESIZE_TARGETS.find((x) => x.id === id)!;
  return resizeDocument(doc, { purpose: t.purpose, format: t.format, sizes: PAGE_FORMAT_SIZES, link });
};

describe("resize engine mirror", () => {
  it("hashes to RESIZE_HASH (run npm run sync:studio-resize, never edit resize.ts)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/studio/resize.ts"));
    expect(createHash("sha256").update(src).digest("hex")).toBe(RESIZE_HASH);
  });

  it("makes a linked deck from the fixture: a title slide, one slide per page, flows → one full-report slide", () => {
    const r = run("deck");
    if (!r.ok) throw new Error(r.detail);
    expect(r.doc.format).toBe("slide_16_9");
    expect(r.doc.purpose).toBe("deck");
    expect(r.doc.source).toEqual(link);
    expect(r.report.pages.map((p) => p.layout)).toEqual(["title", "text", "chart", "chart", "full_report"]);
    expect(r.report.pages[4].from).toEqual(["p-categories", "p-factors"]);
  });

  it("makes a one-page summary and social cards; a booklet keeps every page", () => {
    for (const id of ["summary", "social_square", "social_wide"]) {
      const r = run(id);
      expect(r.ok && r.doc.pages.length).toBe(1);
    }
    const b = run("booklet");
    expect(b.ok && b.doc.pages.length).toBe((ghgDoc.pages as unknown[]).length);
  });

  it("lists chapters and cuts text with an ellipsis", () => {
    expect(resizeChapters(doc, PAGE_FORMAT_SIZES).map((c) => c.id)).toContain("summary");
    const cut = truncateTextDoc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "One two three four five six seven" }] }] }, 15);
    expect(cut.truncated).toBe(true);
    expect(plainText(cut.doc)).toBe("One two three…");
  });
});

import { describe, expect, it } from "vitest";
import ghgDoc from "../../../test/fixtures/studio/ghg-doc.json";
import type { ReportDoc } from "../../../lib/studio/contracts";
import { RESIZE_TARGETS } from "../../../lib/studio/resize";
import { chaptersOf, copyTitle, countText, defaultChapterIds, pageIdsFor, planTargets, previewNote } from "./logic";

const doc = ghgDoc as unknown as ReportDoc;
const target = (id: string) => RESIZE_TARGETS.find((t) => t.id === id)!;

describe("resize dialog logic", () => {
  it("plans every target from the design: page counts, a linked doc each", () => {
    const plans = planTargets(doc);
    expect(plans.map((p) => [p.target.id, p.ok, p.pageCount])).toEqual([
      ["deck", true, 5],
      ["summary", true, 1],
      ["social_square", true, 1],
      ["social_wide", true, 1],
      ["booklet", true, 5],
    ]);
    expect(plans[0].doc?.meta.title).toBe(`${doc.meta.title} · Board deck`);
  });

  it("says why a target can't be made: a deck has no A5 booklet, flows alone make no card", () => {
    const deck = planTargets(doc)[0].doc as ReportDoc;
    const fromDeck = planTargets(deck);
    expect(fromDeck.find((p) => p.target.id === "booklet")).toMatchObject({ ok: false, reason: "Keeps the page shape, so only A4-shaped designs" });
    const flows = { ...doc, pages: doc.pages.filter((p) => p.kind === "flow") };
    expect(planTargets(flows).find((p) => p.target.id === "social_square")).toMatchObject({ ok: false, reason: "Needs a page with numbers or a chart" });
  });

  it("sends pageIds only when the chapter picker changed", () => {
    const chapters = chaptersOf(doc);
    const on = defaultChapterIds(chapters);
    expect(pageIdsFor(chapters, on)).toBeUndefined();
    const first = chapters[0];
    const fewer = new Set([...on].filter((id) => id !== first.id));
    const ids = pageIdsFor(chapters, fewer)!;
    expect(ids.some((id) => first.pageIds.includes(id))).toBe(false);
    expect(pageIdsFor(chapters, new Set())).toEqual([]);
  });

  it("words: counts, titles and the preview note", () => {
    expect(countText(target("deck"), 9)).toBe("9 slides");
    expect(countText(target("deck"), 1)).toBe("1 slide");
    expect(countText(target("summary"), 1)).toBe("1 page");
    expect(countText(target("social_wide"), 1)).toBe("1 card");
    expect(copyTitle("GHG Inventory FY26", "social_square")).toBe("GHG Inventory FY26 · Social card 1:1");
    const deck = planTargets(doc)[0];
    expect(previewNote(deck, 3)).toMatch(/^Showing 3 of 5 slides\. Sections left out become one “See the full report” slide\./);
  });
});

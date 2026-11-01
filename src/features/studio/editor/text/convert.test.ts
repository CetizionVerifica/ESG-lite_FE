// @vitest-environment jsdom
// DS-7 · TextDoc ↔ TipTap: data chips of both sources survive a round trip
// through the editor; marks (footnote included) and lists keep their shape;
// paste is sanitised to the contract; `{{` is found before the cursor; chips
// copy as their value; footnote runs number like the renderer.
import { afterEach, describe, expect, it } from "vitest";
import { Editor, generateJSON } from "@tiptap/core";
import type { DataToken, TextDoc } from "../../../../lib/studio/contracts";
import { footnoteNotes } from "../../../../lib/studio/render";
import { chipsOf, cleanPastedHtml, fromTiptap, sameText, textOf, toTiptap, type PmJson } from "./convert";
import { footnoteRunEnds, studioTextExtensions, triggerAt } from "./extensions";

const ghgChip: DataToken = { type: "data", attrs: { binding: { source: "ghg", metric: "scope1", years: { last: 1 }, sites: "all" }, measure: "value", format: "auto" } };
const kpiChip: DataToken = { type: "data", attrs: { binding: { source: "kpi", kpis: ["ENV-ENERGY-RENEW-SHARE"], years: { last: 1 }, sites: [1, 2] }, measure: "change_pct", year: "prior" } };
const s3Chip: DataToken = { type: "data", attrs: { binding: { source: "ghg", metric: "scope3_category", scope3Category: 4, years: { last: 2 }, sites: [2], compare: "prior" }, measure: "change_abs", format: "1dp" } };

const DOC: TextDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Scope 1 " }, ghgChip] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Renewables " },
        kpiChip,
        { type: "text", text: " and transport ", marks: [{ type: "bold" }, { type: "footnote", attrs: { note: "DEFRA 2024" } }] },
        s3Chip,
        { type: "hardBreak" },
        { type: "text", text: "see", marks: [{ type: "link", attrs: { href: "https://ghgprotocol.org" } }] },
        { type: "text", text: " here", marks: [{ type: "italic" }, { type: "highlight", attrs: { color: "#fde68a" } }] },
      ],
    },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }] },
    { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "three" }] }] }] },
    { type: "paragraph" },
  ],
};

let editors: Editor[] = [];
const make = (content: PmJson, extra: Parameters<typeof studioTextExtensions>[0] = {}) => {
  const e = new Editor({ extensions: studioTextExtensions(extra), content: content as never });
  editors.push(e);
  return e;
};
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
});

describe("DataChip serialisation", () => {
  it("round-trips a TextDoc with GHG and KPI chips through the converter unchanged", () => {
    expect(fromTiptap(toTiptap(DOC))).toEqual(DOC);
  });

  it("round-trips through the TipTap editor (both sources, measures, formats, years, sites)", () => {
    const e = make(toTiptap(DOC));
    const back = fromTiptap(e.getJSON() as PmJson);
    expect(back).toEqual(DOC);
    expect(chipsOf(back)).toEqual([ghgChip, kpiChip, s3Chip]);
  });

  it("copies a chip as its value (renderText) and parses a pasted chip back to the node", () => {
    const shown: Record<string, string> = { ghg: "12,480.000", kpi: "+4.2%" }; // #209: the server's tCO₂e display has 3 decimals
    const e = make(toTiptap(DOC), { chipText: (a) => shown[(a.binding as { source: string }).source] ?? "#" });
    expect(e.getText()).toContain("Scope 1 12,480.000");
    expect(e.getText()).toContain("Renewables +4.2%");
    const html = e.getHTML();
    expect(html).toContain("data-ds-chip");
    const again = fromTiptap(generateJSON(html, studioTextExtensions()) as PmJson);
    expect(chipsOf(again)).toEqual([ghgChip, kpiChip, s3Chip]);
  });

  it("drops chips without a source of their own and attributes outside the contract", () => {
    const messy = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "data", attrs: { binding: { source: "custom", columns: [], rows: [] }, measure: "value" } },
            { type: "data", attrs: { binding: ghgChip.attrs.binding, measure: "bogus", format: null, year: null, extra: 1 } },
            { type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "underline" }, { type: "footnote", attrs: { note: "  " } }] },
          ],
        },
      ],
    };
    expect(fromTiptap(messy)).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "data", attrs: { binding: ghgChip.attrs.binding, measure: "value" } }, { type: "text", text: "x" }] }] });
  });
});

describe("paste sanitising", () => {
  it("strips spans, styles, images and scripts and keeps the words", () => {
    const html = `<meta charset="utf-8"><style>p{color:red}</style><p style="color:red" class="x" onclick="evil()"><span style="font-size:30px">Scope <b>1</b></span><img src="x.png" onerror="evil()"><script>alert(1)</script> fell</p><blockquote>Quoted <u>under</u></blockquote><table><tr><td>cell</td></tr></table>`;
    const cleaned = cleanPastedHtml(html);
    expect(cleaned).not.toMatch(/<script|<style|<img|style=|onclick|class=/i);
    const doc = fromTiptap(generateJSON(cleaned, studioTextExtensions()) as PmJson);
    const json = JSON.stringify(doc);
    expect(json).not.toMatch(/img|script|span|style|underline|blockquote|table/);
    expect(textOf(doc)).toContain("Scope 1 fell");
    expect(textOf(doc)).toContain("Quoted under");
    expect(textOf(doc)).toContain("cell");
    expect(doc.content[0].content?.[1]).toEqual({ type: "text", text: "1", marks: [{ type: "bold" }] });
  });
});

describe("the {{ trigger", () => {
  it("finds the query before the cursor and nothing after a closed chip", () => {
    const e = make({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Total is {{sco" }] }] });
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    const t = triggerAt(e.state);
    expect(t).toMatchObject({ active: true, query: "sco" });
    expect(e.state.doc.textBetween(t.from, t.to)).toBe("{{sco");
    e.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A {{b}} c" }] }] });
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    expect(triggerAt(e.state).active).toBe(false);
  });
});

describe("footnote numbers in the editor", () => {
  it("number runs like the renderer, from the element's base", () => {
    const e = make(toTiptap(DOC), { footnoteBase: () => 3 });
    const ends = footnoteRunEnds(e.state.doc, 3);
    expect(ends.map((x) => [x.n, x.note])).toEqual([[3, "DEFRA 2024"]]);
    expect(footnoteNotes(DOC as never)).toEqual(["DEFRA 2024"]);
    expect(e.view.dom.querySelector('sup[data-fn="3"]')?.textContent).toBe("3");
  });

  it("a no-op edit is the same text", () => {
    expect(sameText(DOC, fromTiptap(make(toTiptap(DOC)).getJSON() as PmJson))).toBe(true);
  });
});

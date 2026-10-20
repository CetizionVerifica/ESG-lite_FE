/**
 * DS-8 · the FE mirror draws the GHG chart kinds byte for byte as ESG-lite
 * does (ci/golden/ds/render/ghg-snapshots.json, copied by
 * npm run sync:studio-render), and reads the same kind-validity rules.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import fixture from "../../test/fixtures/studio-render/ghg-fixture.json";
import snapshots from "../../test/fixtures/studio-render/ghg-snapshots.json";
import { GHG_CHART_KINDS, RENDER_HASH, chartKindValidity, defaultGhgChart, renderDocument, renderSheet, validChartKinds, type RenderData, type RenderDoc, type RenderFreeformPage, type RenderMode } from "./render";

const doc = fixture.doc as unknown as RenderDoc;
const data = fixture.data as unknown as RenderData;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("GHG charts in the FE mirror", () => {
  it("were written by this RENDER_HASH", () => {
    expect(snapshots.renderHash).toBe(RENDER_HASH);
  });

  it("render each chart's HTML as ESG-lite does", () => {
    const html = renderSheet(doc.pages[0] as RenderFreeformPage, doc, data, { mode: "sheet" }).html;
    for (const [id, want] of Object.entries(snapshots.elements)) expect(html.includes(want as string), id).toBe(true);
  });

  it("render the page in every mode as ESG-lite does", () => {
    for (const mode of ["sheet", "paged", "present", "print"] as RenderMode[]) {
      const r = renderDocument(doc, data, { mode, cropMarks: mode === "print" });
      expect({ mode, sha256: sha(r.html + "\n" + r.css), bytes: r.html.length + r.css.length }).toEqual({ mode, ...(snapshots.modes as Record<string, object>)[mode] });
    }
  });

  it("share the kind rules: defaults are valid, Scope 3 by category feeds category bars and the treemap", () => {
    for (const k of GHG_CHART_KINDS) expect(chartKindValidity(k, defaultGhgChart(k, { year: 2025 }).binding).ok, k).toBe(true);
    const kinds = validChartKinds({ source: "ghg", metric: "scope3", breakdown: "scope3_category", years: { last: 1 } });
    expect(kinds).toContain("treemap");
    expect(kinds).not.toContain("scope_split");
  });
});

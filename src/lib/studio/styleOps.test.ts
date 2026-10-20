import { describe, expect, it } from "vitest";
import ghgFixture from "../../test/fixtures/studio/ghg-doc.json";
import { contrast } from "../../theme/color";
import type { FreeformPage, ReportDoc, StylePreset } from "./contracts";
import { applyStyle, isOpener, oldRoleColours, shuffleStyle, shuffleVariant, variantFor } from "./styleOps";

const doc = () => JSON.parse(JSON.stringify(ghgFixture)) as ReportDoc;
const PLEX: StylePreset = { id: "plex", name: "Plex", palette: ["#1d4ed8", "#0e7490", "#0f172a", "#f8fafc", "#64748b"], fonts: { heading: "ibm-plex-serif", body: "ibm-plex-sans" } };
const AMBER: StylePreset = { id: "amber", name: "Amber", palette: ["#0f5132", "#f59e0b", "#111827", "#ffffff", "#5f6b7c"], fonts: { heading: "fraunces", body: "source-sans-3" } };
const freeform = (d: ReportDoc, id: string) => d.pages.find((p) => p.id === id) as FreeformPage;

describe("applyStyle", () => {
  it("writes styleId, theme colours and fonts", () => {
    const next = applyStyle(doc(), PLEX);
    expect(next.design.styleId).toBe("plex");
    expect(next.design.theme.colors).toMatchObject({ primary: "#1d4ed8", accent: "#0e7490", ink: "#0f172a", surface: "#f8fafc", muted: "#64748b" });
    expect(next.design.theme.fonts).toEqual({ heading: "ibm-plex-serif", body: "ibm-plex-sans" });
    expect(next.design.theme.look).toBe("classic");
    expect(next.design.templateId).toBe("ghg-inventory");
  });

  it("is pure: the input doc is unchanged and untouched pages keep their identity", () => {
    const before = doc();
    const snapshot = JSON.stringify(before);
    const next = applyStyle(before, PLEX);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(next).not.toBe(before);
    // p-summary has no colour equal to an old role: same object.
    expect(freeform(next, "p-summary")).toBe(freeform(before, "p-summary"));
    expect(applyStyle(before, PLEX)).toEqual(next);
  });

  it("clears element colours and backgrounds that match the old palette roles, keeps others", () => {
    const d = doc();
    // Old roles are the fixture theme's primary #0F5132 and accent #F59E0B.
    expect([...oldRoleColours(d)].sort()).toEqual(["#0f5132", "#f59e0b"]);
    const cover = freeform(d, "p-cover");
    cover.elements.push({ id: "x.shape", type: "shape", frame: { x: 0, y: 0, w: 10, h: 10, rotation: 0 }, z: 9, source: "user", props: { shape: "rect", fill: "#f59e0b", stroke: "#123456" } });
    const next = applyStyle(d, PLEX);
    const nc = freeform(next, "p-cover");
    expect(nc.background.color).toBeUndefined(); // was the old primary
    const shape = nc.elements.find((e) => e.id === "x.shape");
    expect(shape?.props).toEqual({ shape: "rect", stroke: "#123456" }); // fill cleared, stroke kept
    const title = nc.elements.find((e) => e.id === "p-cover.title");
    expect((title?.props as { color?: string }).color).toBe("#FFFFFF"); // not a role colour
    expect(freeform(next, "p-scope3").background.color).toBe("#FFFFFF");
  });

  it("is undoable: applying a second style leaves the earlier snapshot exact, and re-applying settles", () => {
    const d0 = doc();
    const d1 = applyStyle(d0, PLEX);
    const d2 = applyStyle(d1, AMBER);
    // History keeps snapshots (DS-6): undo = the previous doc, unchanged by later applies.
    expect(JSON.stringify(d1)).toBe(JSON.stringify(applyStyle(doc(), PLEX)));
    expect(d2.design.styleId).toBe("amber");
    // Re-applying the same style settles: the second pass already cleared colours equal to its roles.
    const d3 = applyStyle(d2, AMBER);
    expect(applyStyle(d3, AMBER)).toEqual(d3);
  });
});

describe("shuffle", () => {
  it("is deterministic per seed and never the plain preset first", () => {
    expect(variantFor(0)).toEqual({ swapPrimaryAccent: true, darkOpeners: false });
    expect(variantFor(4)).toEqual(variantFor(0));
    expect(variantFor(-1)).toEqual(variantFor(3));
    for (const seed of [0, 1, 2, 3, 7]) expect(shuffleStyle(doc(), PLEX, seed)).toEqual(shuffleStyle(doc(), PLEX, seed));
    expect(shuffleStyle(doc(), PLEX, 0)).not.toEqual(shuffleStyle(doc(), PLEX, 1));
  });

  it("swaps primary and accent only when the accent can carry headings", () => {
    expect(shuffleVariant(PLEX, 0).preset.palette.slice(0, 2)).toEqual(["#0e7490", "#1d4ed8"]);
    // Amber on white is 2.15:1: no swap.
    const amber = shuffleVariant(AMBER, 0);
    expect(amber.variant.swapPrimaryAccent).toBe(false);
    expect(amber.preset.palette).toEqual(AMBER.palette);
  });

  it("dark openers: cover gets the primary background and readable text; other pages stay light", () => {
    const next = shuffleStyle(doc(), PLEX, 1);
    const cover = freeform(next, "p-cover");
    expect(isOpener(cover)).toBe(true);
    expect(cover.background.color).toBe("#1d4ed8");
    expect(contrast("#f8fafc", "#1d4ed8")).toBeGreaterThanOrEqual(4.5);
    expect(freeform(next, "p-summary").background.color).toBeUndefined();
    // Shuffling again to a light variant clears the dark opener (its colours are old roles now).
    const back = shuffleStyle(next, PLEX, 0);
    expect(freeform(back, "p-cover").background.color).toBeUndefined();
  });

  it("shuffle twice then undo twice returns the original doc", () => {
    const d0 = doc();
    const history = [d0];
    history.push(shuffleStyle(history[0], PLEX, 0));
    history.push(shuffleStyle(history[1], PLEX, 1));
    expect(history[2]).not.toEqual(history[1]);
    expect(history[0]).toEqual(doc());
  });
});

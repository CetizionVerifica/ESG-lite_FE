/**
 * PE-1 · photo edits in the renderer mirror (render/imageFx.ts): the slider
 * and preset mapping is pinned, and every render mode (editor sheet, Page
 * view, Present, PDF print) draws the same filter markup for an edited frame,
 * so print matches the screen. A frame without edits renders as before PE-1.
 */
import { describe, expect, it } from "vitest";
import fixture from "../../test/fixtures/studio-render/fixture-a4.json";
import { IMAGE_FILTER_CSS, adjustValues, imageFilterCss, imageFilterId, imageSvgFilter, needsSvgFilter, renderDocument, renderSheet, type ImageEditProps, type RenderDoc, type RenderFreeformPage } from "./render";

const doc = fixture.doc as unknown as RenderDoc;
const assets = fixture.assets;

type El = { id: string; type: string; props: Record<string, unknown> };
type Pg = { kind: string; elements?: El[] };
const pictureOf = (d: RenderDoc) => {
  for (const p of d.pages as unknown as Pg[]) {
    const el = (p.elements ?? []).find((e) => e.type === "frame" || e.type === "image");
    if (el) return { page: p as unknown as RenderFreeformPage, el };
  }
  throw new Error("fixture has no picture");
};
function withEdits(edits: ImageEditProps): RenderDoc {
  const d = JSON.parse(JSON.stringify(doc)) as RenderDoc;
  Object.assign(pictureOf(d).el.props, edits);
  return d;
}

describe("imageFx mapping", () => {
  it("maps the sliders to CSS filter functions after the preset", () => {
    expect(imageFilterCss({})).toBe("");
    expect(imageFilterCss({ filter: "none" })).toBe("");
    expect(imageFilterCss({ filter: "vivid", adjust: { brightness: 12, contrast: 8, saturation: -50, blur: 10 } })).toBe(`${IMAGE_FILTER_CSS.vivid} brightness(1.06) contrast(1.04) saturate(0.5) blur(0.3mm)`);
    for (const f of ["vivid", "mono", "warm", "cool", "fade"] as const) expect(imageFilterCss({ filter: f })).toBe(IMAGE_FILTER_CSS[f]);
  });

  it("clamps out-of-range and non-integer slider values", () => {
    expect(adjustValues({ brightness: 300, blur: -4, contrast: 3.6, warmth: Number.NaN })).toEqual({ brightness: 100, contrast: 4, saturation: 0, warmth: 0, blur: 0 });
  });

  it("draws warmth and duotone as an SVG filter only when set", () => {
    expect(needsSvgFilter({})).toBe(false);
    expect(needsSvgFilter({ adjust: { warmth: -5 } })).toBe(true);
    expect(needsSvgFilter({ duotone: { dark: "#0b2e4f", light: "#e6f0fa" } })).toBe(true);
    expect(needsSvgFilter({ duotone: { dark: "red", light: "#e6f0fa" } })).toBe(false);
    expect(imageSvgFilter("f", {})).toBe("");
    expect(imageSvgFilter("f", { adjust: { warmth: 100 } })).toContain('values="1.15 0 0 0 0 0 1 0 0 0 0 0 0.85 0 0 0 0 0 1 0"');
    const duo = imageSvgFilter("f", { duotone: { dark: "#000000", light: "#ffffff" } });
    expect(duo).toContain('<feFuncR type="table" tableValues="0 1"/>');
    expect(duo).toContain('color-interpolation-filters="sRGB"');
  });

  it("gives each element its own stable filter id", () => {
    expect(imageFilterId("p-cover.bg")).toBe(imageFilterId("p-cover.bg"));
    expect(imageFilterId("a")).not.toBe(imageFilterId("b"));
    expect(imageFilterId("x y<z")).toMatch(/^ds-fx-[A-Za-z0-9_-]+$/);
  });
});

describe("imageFx in every render mode", () => {
  const edits: ImageEditProps = { filter: "warm", adjust: { brightness: 12, contrast: 8, warmth: -5, blur: 4 }, duotone: { dark: "#0b2e4f", light: "#e6f0fa" } };

  it("leaves a picture without edits as before PE-1", () => {
    const html = renderDocument(doc, null, { mode: "paged", assets }).html;
    expect(html).not.toContain("ds-fx");
  });

  it("draws the same filter markup in the sheet, Page view, Present and print", () => {
    const d = withEdits(edits);
    const { page, el } = pictureOf(d);
    const id = imageFilterId(el.id);
    const css = imageFilterCss(edits);
    const svg = imageSvgFilter(id, edits);
    const outputs = [renderSheet(page, d, null, { mode: "sheet", assets }).html, ...(["paged", "present", "print"] as const).map((mode) => renderDocument(d, null, { mode, assets }).html)];
    for (const html of outputs) {
      expect(html).toContain(`filter:${css};`);
      expect(html).toContain(svg);
      expect(html).toContain(`filter:url(#${id});`);
    }
  });

  it("uses only CSS filters when there is no warmth or duotone", () => {
    const html = renderDocument(withEdits({ filter: "mono", adjust: { contrast: 20 } }), null, { mode: "print", assets }).html;
    expect(html).toContain(`filter:${IMAGE_FILTER_CSS.mono} contrast(1.1);`);
    expect(html).not.toContain("ds-fx-defs");
  });
});

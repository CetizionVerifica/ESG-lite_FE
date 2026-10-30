/**
 * #209 round 6 · the FE mirror places column value labels as ESG-lite does: a label never rests on a
 * neighbouring column. The reviewers' frames (ESG-lite ci/unit/ds-209-layout.test.cjs ROUND6_CASES),
 * where round 5 left a label 0.2–0.6 units over a neighbour's top while its own was farther:
 * of the columns under or over a label's ink (sharing any of its width) its own is the nearest or
 * within one SMALL of it, and no other column's top is within 2 units under its ink while its own
 * is 4 or more farther. And (D14) monthly_stack labels its peak with the month's own figure.
 */
import { describe, expect, it } from "vitest";
import { buildTheme, chartRenderer, formatNumber } from "./render";
import { SMALL, inkBox, type ChartInput } from "./render/charts/svg";

type Frame = { kind: string; w: number; h: number; value: ChartInput["value"] };
const total = (values: number[]) => ({ display: "", value: 1, unit: "tCO₂e", series: [{ label: "Total", values: values.map((value, i) => ({ key: String(2019 + i), value })) }] });

const FRAMES: [string, Frame][] = [
  ["m2718 fe #367", { kind: "target_bars", w: 159, h: 137, value: { ...total([2768.963, 26112.037, 2834.447, 19777.896, 93075.226, 176570.625]), target: { baseline: 111884.456, value: 16097.309, year: 2030 } } }],
  ["m77 fe #358", { kind: "target_bars", w: 160, h: 125, value: { ...total([152160.817, 17127.372, 4408.763, 88232.626, 20420.324, 2464.087]), target: { baseline: 91348.493, value: 161914.308, year: 2030 } } }],
  ["m77 ext #229", { kind: "bar", w: 127, h: 135, value: total([6734.787, 4794.997, 141006.083, 721.844, 9566.288, 150560.035, 19518.909]) }],
];

const attr = (a: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(a)?.[1];
const draw = (kind: string) => {
  const f = chartRenderer(kind);
  if (!f) throw new Error(`no renderer for ${kind}`);
  return f;
};

/** Each drawn value label's ink box and the index of its own column (the columns in x order, one per year). */
function placed(f: Frame) {
  const svg = draw(f.kind)({ value: f.value, w: f.w, h: f.h, theme: buildTheme({}), options: {}, label: f.kind });
  const cols = [...svg.matchAll(/<rect([^>]*)\/>/g)]
    .map((m) => ({ x0: Number(attr(m[1], "x")), x1: Number(attr(m[1], "x")) + Number(attr(m[1], "width")), top: Number(attr(m[1], "y")), bottom: Number(attr(m[1], "y")) + Number(attr(m[1], "height")) }))
    .sort((a, b) => a.x0 - b.x0);
  const want = (f.value.series?.[0].values ?? []).map((p) => formatNumber(p.value, "auto", "tCO₂e"));
  const labels = [...svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)]
    .filter((m) => want.includes(m[2]))
    .map((m) => ({ s: m[2], k: want.indexOf(m[2]), box: inkBox(Number(attr(m[1], "x")), Number(attr(m[1], "y")), m[2], Number(attr(m[1], "font-size")), { anchor: "middle", bold: attr(m[1], "font-weight") === "700" }) }));
  return { cols, want, labels };
}

describe("column value labels in the FE mirror (#209 round 6)", () => {
  for (const [name, frame] of FRAMES) {
    it(`${name}: every drawn label reads as its own column's`, () => {
      const { cols, want, labels } = placed(frame);
      expect(cols).toHaveLength(want.length);
      expect(labels.length).toBeGreaterThan(0);
      for (const { s, k, box } of labels) {
        const across = cols.map((o, j) => ({ o, j })).filter(({ o }) => Math.min(o.x1, box.x1) - Math.max(o.x0, box.x0) > 0.01);
        const gap = (o: (typeof cols)[number]) => Math.max(0, o.top - box.y1, box.y0 - o.bottom);
        const own = across.some(({ j }) => j === k) ? gap(cols[k]) : Infinity;
        for (const { o, j } of across.filter(({ j }) => j !== k)) {
          expect(own, `${s}: column ${j} at ${gap(o).toFixed(2)}, its own at ${own.toFixed(2)}`).toBeLessThanOrEqual(gap(o) + SMALL + 0.01);
          const rests = o.top >= box.y1 - 0.01 && o.top - box.y1 < 2 && own >= o.top - box.y1 + 4;
          expect(rests, `${s}: rests ${(o.top - box.y1).toFixed(2)} over column ${j}, its own at ${own.toFixed(2)}`).toBe(false);
        }
      }
    });
  }
});

describe("monthly_stack in the FE mirror (D14)", () => {
  it("labels its peak with the month's own figure, not its rounded scope stacks added up", () => {
    // January: Scope 1 2,124.2 kg → 2.124 t and Scope 2 1,234.4 kg → 1.234 t (each rounded on its own) add to 3.358;
    // the month is 3,358.6 kg → 3.359 t. A series that is not the stacks' total (custom data) keeps the stacks' 3.358.
    const stacks = [
      { label: "Scope 1", values: [{ key: "2016-01", value: 2.124 }, { key: "2016-02", value: 1.234 }] },
      { label: "Scope 2", values: [{ key: "2016-01", value: 1.234 }, { key: "2016-02", value: 0 }] },
    ];
    const months = (jan: number) => [{ label: "2016", values: [{ key: "2016-01", value: jan }, { key: "2016-02", value: 1.234 }] }];
    const texts = (jan: number) =>
      [...draw("monthly_stack")({ value: { display: "", value: 4.593, unit: "tCO₂e", series: months(jan), stacks }, w: 400, h: 220, theme: buildTheme({}), options: {}, label: "monthly_stack" }).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(texts(3.359)).toContain("3.359");
    expect(texts(3.359)).not.toContain("3.358");
    expect(texts(9.5)).toContain("3.358");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { resetMotionPreference } from "../../../lib/insights/motion";
import { esgRingData } from "../../../test/msw/insightsData";
import { AUTO_GLYPH, RING_SERIES_ID, centreText, topicBars, topicBarsOption, pillarAfterClick, ringAria, ringNodes, ringOption, ringTable, ringTooltip, topicOpacity, visiblePillars, zoomedPillar } from "./esgRingLogic";
import { testTheme as t } from "./testTheme";

type Opt = { series: Array<Record<string, unknown>>; graphic: { elements: Array<Record<string, unknown>> }; tooltip: { formatter: (p: unknown) => string } };

describe("esgRingLogic (IN-2 A)", () => {
  it("maps coverage to opacity 0.25 → 1, clamped", () => {
    expect(topicOpacity(0)).toBe(0.25);
    expect(topicOpacity(100)).toBe(1);
    expect(topicOpacity(50)).toBeCloseTo(0.625);
    expect(topicOpacity(-10)).toBe(0.25);
    expect(topicOpacity(140)).toBe(1);
    expect(topicOpacity(Number.NaN)).toBe(0.25);
  });

  it("builds pillar → topic nodes in the server's order, sized by KPI count, coloured by pillar", () => {
    const nodes = ringNodes(esgRingData, null, t);
    expect(nodes.map((n) => n.name)).toEqual(["Environment", "Social", "Governance"]);
    const e = nodes[0];
    expect(e.kind).toBe("pillar");
    expect(e.value).toBe(16);
    expect(e.itemStyle.color).toBe("pillar-e");
    expect(e.label.formatter).toBe("E");
    if (e.kind !== "pillar") throw new Error("pillar");
    expect(e.children.map((c) => c.value)).toEqual([6, 4, 3, 3]);
    expect(e.children[0].label.formatter).toBe(`Climate ${AUTO_GLYPH}`);
    expect(e.children[2].label.formatter).toBe("Water");
    expect(e.children[1].itemStyle.opacity).toBeCloseTo(0.25 + 0.75 * 0.75);
    expect(nodes[2].label.formatter).toBe("G");
  });

  it("zooms onto the page pillar, and falls back to all when it isn't in the data", () => {
    expect(visiblePillars(esgRingData, "social").map((p) => p.pillar)).toEqual(["social"]);
    expect(zoomedPillar(esgRingData, "social")?.label).toBe("Social");
    const onlyE = { ...esgRingData, pillars: esgRingData.pillars.slice(0, 1) };
    expect(visiblePillars(onlyE, "social")).toHaveLength(1);
    expect(zoomedPillar(onlyE, "social")).toBeNull();
    expect(centreText(esgRingData, null)).toEqual({ value: "69%", caption: "approved" });
    expect(centreText(esgRingData, "governance")).toEqual({ value: "55%", caption: "Governance · back" });
  });

  it("sunburst option: rootToNode, server order kept, centre text, back handler only when zoomed", () => {
    const back = () => undefined;
    const o = ringOption(esgRingData, null, t, back) as unknown as Opt;
    const s = o.series[0];
    expect(s.type).toBe("sunburst");
    expect(s.nodeClick).toBe("rootToNode");
    expect((s.sort as (a: unknown, b: unknown) => number)(1, 2)).toBe(0);
    expect((s.data as unknown[]).length).toBe(3);
    const centre = o.graphic.elements[0];
    expect((centre.style as { text: string }).text).toContain("69%");
    expect(centre.onclick).toBeUndefined();
    const z = ringOption(esgRingData, "environment", t, back) as unknown as Opt;
    expect((z.series[0].data as unknown[]).length).toBe(1);
    expect(z.graphic.elements[0].onclick).toBe(back);
  });

  it("tooltips say coverage, counts and the share filled from data", () => {
    const nodes = ringNodes(esgRingData, null, t);
    if (nodes[0].kind !== "pillar") throw new Error("pillar");
    const energy = ringTooltip(nodes[0].children[1], esgRingData);
    expect(energy).toContain("<b>Energy</b> · Environment");
    expect(energy).toContain("75% of KPI values approved");
    expect(energy).toContain("3 of 4 KPIs");
    expect(energy).toContain("50% filled from your data");
    const water = ringTooltip(nodes[0].children[2], esgRingData);
    expect(water).not.toContain("filled from your data");
    expect(ringTooltip(nodes[1], esgRingData)).toContain("Social (S)");
    expect(ringTooltip(undefined, esgRingData)).toBe("");
    const o = ringOption(esgRingData, null, t) as unknown as Opt;
    expect(o.tooltip.formatter({ data: nodes[2] })).toContain("55% of KPI values approved");
  });

  it("escapes server labels in tooltips", () => {
    const data = { ...esgRingData, pillars: [{ ...esgRingData.pillars[0], topics: [{ ...esgRingData.pillars[0].topics[0], label: "<b>x</b>" }] }] };
    const nodes = ringNodes(data, null, t);
    if (nodes[0].kind !== "pillar") throw new Error("pillar");
    expect(ringTooltip(nodes[0].children[0], data)).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("aria sentence and table rows", () => {
    expect(ringAria(esgRingData, null)).toBe("ESG data readiness 69% of KPI values approved: Environment 81%, Social 62%, Governance 55%.");
    expect(ringAria(esgRingData, "social")).toBe("Social: 62% of KPI values approved (Workforce 80%, Health and safety 50%, Training 50%).");
    const all = ringTable(esgRingData, null);
    expect(all.columns.map((c) => c.header)).toEqual(["Pillar", "Topic", "KPIs", "Approved", "Coverage", "From data"]);
    expect(all.rows).toHaveLength(9);
    expect(all.rows[0]).toEqual({ pillar: "E · Environment", topic: "Climate", kpis: 6, approved: 6, coverage: "100%", auto: "83%" });
    expect(all.rows[2].auto).toBe("—");
    expect(ringTable(esgRingData, "governance").rows.map((r) => r.topic)).toEqual(["Board and oversight", "Ethics"]);
  });

  it("a pillar click toggles the page filter; a topic click zooms to its pillar", () => {
    expect(pillarAfterClick({ kind: "pillar", pillar: "social" }, null)).toBe("social");
    expect(pillarAfterClick({ kind: "pillar", pillar: "social" }, "social")).toBeNull();
    expect(pillarAfterClick({ kind: "pillar", pillar: "social" }, "environment")).toBe("social");
    expect(pillarAfterClick({ kind: "topic", pillar: "social" }, null)).toBe("social");
    expect(pillarAfterClick({ kind: "topic", pillar: "social" }, "social")).toBeUndefined();
    expect(pillarAfterClick(undefined, "social")).toBeUndefined();
  });
});

describe("ring ⇄ topic bars (G2)", () => {
  afterEach(() => resetMotionPreference(null));
  type Series = { id: string; type: string; data: Array<{ id: string; groupId: string }>; universalTransition: { enabled: boolean } };
  const seriesOf = (o: unknown) => (o as { series: Series[] }).series[0];

  it("gives each topic bar the id and group id of its ring node, under the ring's series id", () => {
    const ringTopics = ringNodes(esgRingData, null, t).flatMap((p) => (p.kind === "pillar" ? p.children : []));
    const bars = topicBars(esgRingData, null, t);
    expect(new Set(bars.map((b) => b.groupId))).toEqual(new Set(ringTopics.map((n) => (n as { groupId: string }).groupId)));
    expect(bars.every((b) => b.groupId === b.id)).toBe(true);
    expect(seriesOf(ringOption(esgRingData, null, t)).id).toBe(RING_SERIES_ID);
    expect(seriesOf(topicBarsOption(esgRingData, null, t))).toMatchObject({ id: RING_SERIES_ID, type: "bar" });
  });

  it("groups the bars by pillar, lowest coverage first, with the pillar letter in each label", () => {
    const bars = topicBars(esgRingData, null, t);
    const pillars = bars.map((b) => b.pillar);
    expect(pillars).toEqual([...pillars].sort((a, b) => ["environment", "social", "governance"].indexOf(a) - ["environment", "social", "governance"].indexOf(b)));
    for (const p of new Set(pillars)) {
      const values = bars.filter((b) => b.pillar === p).map((b) => b.value);
      expect(values).toEqual([...values].sort((a, b) => a - b));
    }
    expect(bars.every((b) => /^[ESG] · /.test(b.name))).toBe(true);
    // Zoomed on a pillar: its topics only.
    expect(new Set(topicBars(esgRingData, "social", t).map((b) => b.pillar))).toEqual(new Set(["social"]));
  });

  it("morphs when motion is allowed and swaps at once under reduced motion", () => {
    resetMotionPreference(false);
    expect(seriesOf(ringOption(esgRingData, null, t)).universalTransition.enabled).toBe(true);
    expect(seriesOf(topicBarsOption(esgRingData, null, t)).universalTransition.enabled).toBe(true);
    resetMotionPreference(true);
    expect(seriesOf(ringOption(esgRingData, null, t)).universalTransition.enabled).toBe(false);
    expect(seriesOf(topicBarsOption(esgRingData, null, t)).universalTransition.enabled).toBe(false);
  });
});

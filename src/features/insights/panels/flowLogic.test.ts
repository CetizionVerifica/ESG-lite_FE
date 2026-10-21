import { describe, expect, it } from "vitest";
import type { Flow } from "../../../lib/insights/contracts";
import { flowData } from "../../../test/msw/insightsData";
import { PLANETPULSE, buildTheme, chartTheme } from "../../../theme";
import {
  FIT_OPACITY,
  TONNES_OPACITY,
  countWidth,
  disclosureRoute,
  flowAria,
  flowHeight,
  flowLinks,
  flowNodes,
  flowOption,
  flowTable,
  flowTarget,
  hasDisclosures,
  linkTooltip,
  nodeTooltip,
} from "./flowLogic";

const t = chartTheme(buildTheme(PLANETPULSE, "light", "light"));
const on = flowData(true);
const off = flowData(false);

type Series = { type: string; nodeAlign: string; emphasis: { focus: string }; data: { name: string }[]; links: unknown[]; label: { formatter: (p: unknown) => string } };
type Tip = { formatter: (p: unknown) => string };

describe("flowLogic (IN-6)", () => {
  it("maps nodes with their server id, plain label, column as depth and colour by kind", () => {
    const nodes = flowNodes(on, t);
    expect(nodes.map((n) => [n.name, n.depth])).toEqual([
      ["site:11", 0],
      ["site:12", 0],
      ["site:13", 0],
      ["scope:1", 1],
      ["scope:2", 1],
      ["scope:3", 1],
      ["kpi:ghg_s1", 2],
      ["kpi:ghg_s2", 2],
      ["kpi:ghg_s3", 2],
      ["disc:GRI:305-1", 3],
      ["disc:BRSR:P6-E7", 3],
      ["disc:ESRS:E1-6", 3],
    ]);
    const color = (id: string) => nodes.find((n) => n.name === id)!.itemStyle.color;
    expect([color("site:11"), color("site:12"), color("site:13")]).toEqual([t.color[0], t.color[1], t.color[2]]);
    expect([color("scope:1"), color("scope:2"), color("scope:3")]).toEqual([t.scopes.s1, t.scopes.s2, t.scopes.s3]);
    expect(color("kpi:ghg_s1")).toBe(t.pillars.environment);
    expect(color("disc:GRI:305-1")).toBe(t.ui.muted);
    expect(nodes.find((n) => n.name === "disc:GRI:305-1")!.display).toBe("GRI 305-1");
  });

  it("tonnes links keep the server value with a gradient; count links are muted, opacity by fit, drawn at a fixed width", () => {
    const links = flowLinks(on, t);
    const tonnes = links.find((l) => l.source === "site:11" && l.target === "scope:1")!;
    expect(tonnes).toMatchObject({ value: 6_100, raw: 6_100, measure: "tCO2e", lineStyle: { color: "gradient", opacity: TONNES_OPACITY } });
    const counts = links.filter((l) => l.measure === "count");
    expect(counts).toHaveLength(5);
    for (const l of counts) {
      expect(l.raw).toBe(1);
      expect(l.value).toBe(countWidth(on));
      expect(l.lineStyle.color).toBe(t.ui.muted);
      expect(l.lineStyle.opacity).toBe(FIT_OPACITY[l.fit!]);
    }
    expect(new Set(counts.map((l) => l.lineStyle.opacity)).size).toBe(3);
    expect(FIT_OPACITY.exact).toBeGreaterThan(FIT_OPACITY.partial);
    expect(FIT_OPACITY.partial).toBeGreaterThan(FIT_OPACITY.derived);
  });

  it("a count link's drawn width is a slice of the widest tonnes link, never wider than it for the busiest KPI", () => {
    // Widest tonnes link 18,250; the busiest KPI feeds 3 (< 4) → 18,250 / 4.
    expect(countWidth(on)).toBe(18_250 / 4);
    const busy: Flow = { nodes: [], links: [{ source: "a", target: "b", value: 100, measure: "tCO2e" }, ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ source: "kpi:x", target: `disc:G:${i}`, value: 1, measure: "count" as const, fit: "exact" as const }))] };
    expect(countWidth(busy) * 8).toBe(100);
    expect(countWidth({ nodes: [], links: [{ source: "kpi:e", target: "disc:G:1", value: 1, measure: "count" }] })).toBe(1);
  });

  it("builds a left-aligned sankey with adjacency focus and the label formatter", () => {
    const option = flowOption(on, t) as unknown as { series: Series[]; tooltip: Tip };
    const s = option.series[0];
    expect(s.type).toBe("sankey");
    expect(s.nodeAlign).toBe("left");
    expect(s.emphasis.focus).toBe("adjacency");
    expect(s.label.formatter({ data: { display: "Gross Scope 1" } })).toBe("Gross Scope 1");
    expect(s.links).toHaveLength(on.links.length);
  });

  it("tooltips: tonnes formatted, counts in words with the fit, disclosures with their framework", () => {
    const labels = new Map(on.nodes.map((n) => [n.id, n.label]));
    expect(linkTooltip(on.links[0], labels)).toBe("Chennai plant → Scope 1<br/>6,100 tCO₂e");
    const partial = on.links.find((l) => l.fit === "partial")!;
    expect(linkTooltip(partial, labels)).toBe("Gross Scope 2 (location) → ESRS E1-6<br/>feeds 1 disclosure · Partial fit");
    expect(nodeTooltip(on.nodes.find((n) => n.id === "disc:GRI:305-1")!, true)).toBe("GRI 305-1<br/>Disclosure · GRI");
    expect(nodeTooltip(off.nodes.find((n) => n.id === "cat:elec")!, false)).toBe("Purchased electricity<br/>Category");
    expect(linkTooltip({ source: "x", target: "y", value: 2, measure: "count" }, new Map([["x", "<b>"]]))).toBe("&lt;b&gt; → y<br/>feeds 2 disclosures");

    const { formatter } = (flowOption(on, t) as unknown as { tooltip: Tip }).tooltip;
    const derived = flowLinks(on, t).find((l) => l.fit === "derived")!;
    expect(formatter({ dataType: "edge", data: derived })).toBe("Gross Scope 3 → ESRS E1-6<br/>feeds 1 disclosure · Derived fit");
    expect(formatter({ dataType: "node", data: { name: "site:12" } })).toBe("Nagpur plant<br/>Site");
  });

  it("table rows: source, target, value, measure and fit in the server's order", () => {
    const { columns, rows } = flowTable(on);
    expect(columns.map((c) => c.header)).toEqual(["From", "To", "Value", "Measure", "Fit"]);
    expect(rows[0]).toEqual({ source: "Chennai plant", target: "Scope 1", value: "6,100", measure: "tCO₂e", fit: null });
    expect(rows.find((r) => r.target === "ESRS E1-6" && r.source === "Gross Scope 3")).toEqual({ source: "Gross Scope 3", target: "ESRS E1-6", value: "1", measure: "Count", fit: "Derived" });
    expect(rows).toHaveLength(on.links.length);
  });

  it("KPI off: no disclosure column, no fit column, a categories sentence", () => {
    expect(hasDisclosures(on)).toBe(true);
    expect(hasDisclosures(off)).toBe(false);
    expect(flowNodes(off, t).some((n) => n.depth === 3)).toBe(false);
    expect(flowTable(off).columns.map((c) => c.id)).toEqual(["source", "target", "value", "measure"]);
    expect(flowAria(off)).toBe("3 sites feed Scope 1, 2 and 3; the scopes split into 3 categories.");
  });

  it("aria sentence and height", () => {
    expect(flowAria(on)).toBe("3 sites feed Scope 1, 2 and 3; 3 KPIs feed 3 disclosures.");
    const one: Flow = { nodes: [{ id: "site:1", label: "A", column: 0, kind: "site" }, { id: "scope:1", label: "Scope 1", column: 1, kind: "scope" }, { id: "kpi:a", label: "K", column: 2, kind: "kpi" }, { id: "disc:G:1", label: "G 1", column: 3, kind: "disclosure" }], links: [] };
    expect(flowAria(one)).toBe("1 site feeds Scope 1; 1 KPI feeds 1 disclosure.");
    expect(flowHeight(on)).toBe(420);
    const many: Flow = { nodes: Array.from({ length: 20 }, (_, i) => ({ id: `disc:G:${i}`, label: `G ${i}`, column: 3 as const, kind: "disclosure" as const })), links: [] };
    expect(flowHeight(many)).toBe(20 * 36 + 60);
  });

  it("click targets: the server link first, a disclosure's framework report, else nothing", () => {
    const links = { "site:11": "/data/ledger?site=11", "scope:1->kpi:ghg_s1": "/kpi/values?kpi=ghg_s1" };
    expect(flowTarget({ dataType: "node", data: { name: "site:11" } }, links)).toBe("/data/ledger?site=11");
    expect(flowTarget({ dataType: "node", data: { name: "disc:BRSR:P6-E7" } }, links)).toBe("/kpi/reports/BRSR");
    expect(flowTarget({ dataType: "node", data: { name: "disc:GRI:305-1" } }, { "disc:GRI:305-1": "/kpi/reports/GRI?code=305-1" })).toBe("/kpi/reports/GRI?code=305-1");
    expect(flowTarget({ dataType: "node", data: { name: "scope:2" } }, links)).toBeNull();
    expect(flowTarget({ dataType: "edge", data: { source: "scope:1", target: "kpi:ghg_s1" } }, links)).toBe("/kpi/values?kpi=ghg_s1");
    expect(flowTarget({ dataType: "edge", data: { source: "kpi:ghg_s1", target: "disc:ESRS:E1-6" } }, links)).toBe("/kpi/reports/ESRS");
    expect(flowTarget({ dataType: "edge", data: { source: "scope:1", target: "site:11" } }, links)).toBe("/data/ledger?site=11");
    expect(flowTarget(undefined, links)).toBeNull();
    expect(disclosureRoute("kpi:x")).toBeNull();
  });
});

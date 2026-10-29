import { describe, expect, it } from "vitest";
import { siteCompareData } from "../../../test/msw/insightsData";
import { SITE_COLUMNS, intensityText, siteAria, siteCompareOption, siteTable, siteTooltip } from "./siteCompareLogic";
import { testTheme as t } from "./testTheme";

type Opt = { series: Array<{ id: string; stack: string; data: number[]; itemStyle: { color: string } }>; yAxis: { data: string[] } };

describe("siteCompareLogic (IN-11)", () => {
  it("stacks Scope 1, 2 and 3 per site in the fixed scope colours, largest site on top", () => {
    const o = siteCompareOption(siteCompareData, t) as unknown as Opt;
    expect(o.series.map((s) => [s.id, s.stack, s.itemStyle.color])).toEqual([
      ["site-s1", "scopes", t.scopes.s1],
      ["site-s2", "scopes", t.scopes.s2],
      ["site-s3", "scopes", t.scopes.s3],
    ]);
    // A category axis draws bottom-up, so the server's first (largest) site is last here.
    expect(o.yAxis.data).toEqual(["Pune plant", "Nagpur plant", "Chennai plant"]);
    expect(o.series[0].data).toEqual([300, 900, 2100]);
  });

  it("puts the server's figures in the table and words, never summing them", () => {
    const rows = siteTable(siteCompareData, "2025");
    expect(SITE_COLUMNS.map((c) => c.id)).toEqual(["site", "net", "change", "share", "s1", "s2", "s3", "intensity", "completeness", "pending"]);
    expect(rows[0]).toMatchObject({ site: "Chennai plant", link: "/overview?period=CY2026&siteIds=11", net: "5,200.0", change: "down 15% on 2025", share: "61%", completeness: "92%", pending: 3 });
    expect(rows[1]).toMatchObject({ change: "—", intensity: "No production data", pending: 0 });
    expect(rows[2].change).toBe("up 5.9% on 2025");
    expect(intensityText(siteCompareData.rows[0])).toBe("0.420 tCO₂e/t");
  });

  it("says the largest site and its change in one sentence; one site or none read plainly", () => {
    expect(siteAria(siteCompareData, "2025")).toBe("Chennai plant is the largest of 3 sites at 61% of net emissions, down 15% on 2025.");
    expect(siteAria({ rows: [siteCompareData.rows[1]] }, "2025")).toBe("Nagpur plant is the only site at 28% of net emissions.");
    expect(siteAria({ rows: [] }, "2025")).toBe("No sites to show.");
  });

  it("tooltips list the scopes and net, escaped", () => {
    expect(siteTooltip({ ...siteCompareData.rows[0], site: "A<b>" })).toContain("<b>A&lt;b&gt;</b>");
    expect(siteTooltip(siteCompareData.rows[0])).toContain("Scope 2: 2,600.000 tCO₂e");
    expect(siteTooltip(undefined)).toBe("");
  });
});

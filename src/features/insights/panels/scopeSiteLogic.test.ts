import { describe, expect, it } from "vitest";
import { flowData } from "../../../test/msw/insightsData";
import { testTheme } from "./testTheme";
import { scopeSiteAria, scopeSiteOption, scopeSiteRows, scopeSiteTable } from "./scopeSiteLogic";

describe("By scope and site (no KPI tracking)", () => {
  it("takes the site → scope links with their server tonnes, nothing else", () => {
    const rows = scopeSiteRows(flowData(false));
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({ site: "Chennai plant", scope: "Scope 1", scopeKey: "s1", value: 6_100 });
    expect(rows.some((r) => r.scope.startsWith("Stationary"))).toBe(false);
  });

  it("draws one box per site with its scopes, coloured by scope", () => {
    const option = scopeSiteOption(scopeSiteRows(flowData(false)), testTheme) as { series: { data: { name: string; children: { name: string; itemStyle: { color: string } }[] }[] }[] };
    const sites = option.series[0].data;
    expect(sites.map((s) => s.name)).toEqual(["Chennai plant", "Nagpur plant", "Pune plant"]);
    expect(sites[2].children.map((c) => c.name)).toEqual(["Scope 1", "Scope 2", "Scope 3"]);
    expect(sites[2].children[2].itemStyle.color).toBe(testTheme.scopes.s3);
  });

  it("has a table and a sentence", () => {
    const rows = scopeSiteRows(flowData(false));
    expect(scopeSiteTable(rows).rows[1]).toEqual({ site: "Chennai plant", scope: "Scope 2", value: 5_900 });
    expect(scopeSiteAria(rows)).toBe("Emissions by site and scope for 3 sites; the largest box is Nagpur plant · Scope 1 (8,020 tCO₂e).");
    expect(scopeSiteAria([])).toBe("No approved emissions by site and scope yet.");
  });
});

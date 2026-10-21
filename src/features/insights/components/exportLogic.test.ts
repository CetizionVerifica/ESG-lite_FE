// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { exportAllChartPngs, snapshotFileName } from "./exportLogic";

describe("export (IN-8)", () => {
  it("names the snapshot after the period and sites", () => {
    expect(snapshotFileName({ year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" })).toBe("insights-CY-2026-all-sites.pdf");
    expect(snapshotFileName({ year: 2025, yearType: "FY", sites: [11, 13], pillar: null, compare: "prior" })).toBe("insights-FY-2025-sites-11-13.pdf");
  });

  it("clicks each chart's own PNG export", () => {
    const root = document.createElement("div");
    const click = vi.fn();
    for (const name of ["a", "b"]) {
      const b = document.createElement("button");
      b.dataset.chartExport = name;
      b.addEventListener("click", click);
      root.appendChild(b);
    }
    expect(exportAllChartPngs(root)).toBe(2);
    expect(click).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { exportAllChartPngs, printViewPath, snapshotErrorCode, snapshotErrorText, snapshotFileName } from "./exportLogic";

describe("export (IN-8)", () => {
  it("names the snapshot after the period and sites", () => {
    expect(snapshotFileName({ year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" })).toBe("insights-CY-2026-all-sites.pdf");
    expect(snapshotFileName({ year: 2025, yearType: "FY", sites: [11, 13], pillar: null, compare: "prior" })).toBe("insights-FY-2025-sites-11-13.pdf");
  });

  it("reads the error code of a failed snapshot from its blob body", async () => {
    const blobError = (body: string) => ({ response: { status: 503, data: new Blob([body], { type: "application/json" }) } });
    expect(await snapshotErrorCode(blobError(JSON.stringify({ code: "IN_SNAPSHOT_UNAVAILABLE", message: "x" })))).toBe("IN_SNAPSHOT_UNAVAILABLE");
    expect(await snapshotErrorCode({ response: { data: { code: "IN_SNAPSHOT_TIMEOUT" } } })).toBe("IN_SNAPSHOT_TIMEOUT");
    expect(await snapshotErrorCode(blobError("<html>Bad gateway</html>"))).toBeNull();
    expect(await snapshotErrorCode(new Error("Network Error"))).toBeNull();
    expect(snapshotErrorText("IN_SNAPSHOT_UNAVAILABLE")).toMatch(/Use Print view/);
    expect(snapshotErrorText(null)).toBe("Couldn't make the PDF snapshot. Try again.");
  });

  it("links the print view with the page's filters", () => {
    expect(printViewPath({ year: 2025, yearType: "FY", sites: [13, 11], pillar: "social", compare: "base" })).toBe("/insights/print?compare=base&pillar=social&sites=11%2C13&year=2025&yearType=FY");
    const thisYear = new Date().getFullYear();
    expect(printViewPath({ year: thisYear, yearType: "CY", sites: "all", pillar: null, compare: "prior" })).toBe(`/insights/print?year=${thisYear}`);
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

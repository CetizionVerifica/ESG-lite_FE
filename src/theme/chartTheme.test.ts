import { describe, expect, it } from "vitest";
import { buildTheme } from "./buildTheme";
import { chartTheme } from "./chartTheme";
import { contrast } from "./color";
import { PLANETPULSE, STORED_BRANDS } from "./packs";
import { pdfTheme } from "./pdfTheme";

describe("chartTheme", () => {
  it("takes every colour from the tokens", () => {
    const t = buildTheme(STORED_BRANDS[1], "night", "dark");
    const theme = chartTheme(t);
    expect(theme.color).toEqual([
      t["series-1"], t["series-2"], t["series-3"], t["series-4"],
      t["series-5"], t["series-6"], t["series-7"], t["series-8"],
    ]);
    expect(theme.textStyle.color).toBe(t.ink);
    expect(theme.tooltip.backgroundColor).toBe(t.panel);
    expect(theme.valueAxis.axisLabel.color).toBe(t.muted);
    expect(theme.scopes).toEqual({ s1: t.s1, s2: t.s2, s3: t.s3 });
  });

  it("rounds bars with ECharts 5+'s borderRadius", () => {
    const { bar } = chartTheme(buildTheme(PLANETPULSE, "light", "light"));
    expect(bar.itemStyle).toEqual({ borderRadius: 2 });
  });

  it("differs between looks so charts re-theme on a switch", () => {
    const light = chartTheme(buildTheme(STORED_BRANDS[1], "light", "light"));
    const night = chartTheme(buildTheme(STORED_BRANDS[1], "night", "dark"));
    expect(light.textStyle.color).not.toBe(night.textStyle.color);
  });
});

describe("pdfTheme", () => {
  it("is always the light look", () => {
    const pdf = pdfTheme(STORED_BRANDS[1]);
    const light = buildTheme(STORED_BRANDS[1], "light", "light");
    expect(pdf.colors.ink).toBe(light.ink);
    expect(pdf.colors.brand).toBe("#0b2e5c");
    expect(pdf.colors.good).toBe("#16794c");
    expect(pdf.cover).toEqual({ from: "#061933", to: "#0b2e5c", text: "#ffffff" });
  });

  it("accepts an API brand and falls back to PlanetPulse without one", () => {
    expect(pdfTheme({ companyId: 3, name: "Glochem Industries", primary: "#7a1f2b", accent: "#b03a4a" }).name)
      .toBe("Glochem Industries");
    expect(pdfTheme(null).colors.brand).toBe(PLANETPULSE.primary);
  });

  it("prints ink, not white, on a light amber cover", () => {
    const pdf = pdfTheme({
      companyId: 9, name: "Amber Co", primary: "#f5b301", accent: "#fcd34d",
      coverFrom: "#fde68a", coverTo: "#fbbf24",
    });
    expect(pdf.cover.text).toBe(pdf.colors.ink);
    for (const bg of [pdf.cover.from, pdf.cover.to]) {
      expect(contrast(pdf.cover.text, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps white cover text on every stored brand's dark gradient", () => {
    for (const pack of Object.values(STORED_BRANDS)) {
      const { cover, colors } = pdfTheme(pack);
      expect(cover.text).toBe("#ffffff");
      // Teal (company 6) is under 4.5:1 at its light end, but white still reads better than ink.
      expect(contrast(cover.text, cover.to)).toBeGreaterThan(contrast(colors.ink, cover.to));
    }
  });

  it("keeps printed text readable on paper for every stored brand", () => {
    for (const pack of Object.values(STORED_BRANDS)) {
      const { colors } = pdfTheme(pack);
      for (const fg of [colors.ink, colors.muted, colors.brandText]) {
        expect(contrast(fg, colors.paper)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

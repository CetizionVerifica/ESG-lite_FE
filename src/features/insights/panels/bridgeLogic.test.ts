import { describe, expect, it } from "vitest";
import type { Bridge } from "../../../lib/insights/contracts";
import type { ChartTheme } from "../../../theme";
import { bridgeData } from "../../../test/msw/insightsData";
import { barColor, barGroupId, barTooltip, bridgeAriaLabel, bridgeOption, bridgeTableRows, driverLabel, inputName, inputRows, inputValue, signed, waterfallBars } from "./bridgeLogic";

const t = {
  ui: { ink: "ink", muted: "muted", line: "line", panel: "panel", tint: "tint", brand: "brand", onBrand: "on-brand", accent: "accent" },
  status: { good: "good", bad: "bad", warn: "warn", info: "info", goodSoft: "gs", badSoft: "bs", warnSoft: "ws", infoSoft: "is" },
} as unknown as ChartTheme;

const small: Bridge = {
  from: { year: 2025, value: 52_100 },
  to: { year: 2026, value: 49_700 },
  steps: [
    { driver: "activity", label: "More output", value: 5_900, inputs: {} },
    { driver: "grid_and_renewables_s2", label: "", value: -6_200, inputs: {} },
    { driver: "scope3", label: "Supply chain (Scope 3)", value: -2_100, inputs: {} },
  ],
  method: "lmdi_additive",
  notes: [],
};

describe("bridge words", () => {
  it("signs changes with a plus or a true minus", () => {
    expect(signed(5_900)).toBe("+5,900.000");
    expect(signed(-6_200)).toBe("−6,200.000");
    expect(signed(0.2)).toBe("+0.200");
    expect(signed(0.0002)).toBe("0.000");
  });

  it("uses the server's driver label, else the plain-words fallback", () => {
    expect(driverLabel({ driver: "activity", label: "More cement" })).toBe("More cement");
    expect(driverLabel({ driver: "grid_and_renewables_s2", label: "" })).toBe("Cleaner electricity");
  });
});

describe("waterfallBars (layout only)", () => {
  it("floats each step on a transparent helper and keeps the server values for labels", () => {
    const bars = waterfallBars(small);
    expect(bars.map((b) => [b.kind, b.name, b.label])).toEqual([
      ["from", "2025", "52,100.000"],
      ["increase", "More output", "+5,900.000"],
      ["decrease", "Cleaner electricity", "−6,200.000"],
      ["decrease", "Supply chain (Scope 3)", "−2,100.000"],
      ["to", "2026", "49,700.000"],
    ]);
    expect(bars.map((b) => b.base)).toEqual([0, 52_100, 51_800, 49_700, 0]);
    expect(bars.map((b) => b.height)).toEqual([52_100, 5_900, 6_200, 2_100, 49_700]);
    expect(bars.map((b) => b.value)).toEqual([52_100, 5_900, -6_200, -2_100, 49_700]);
  });

  it("works on the fixture", () => {
    const bars = waterfallBars(bridgeData);
    expect(bars).toHaveLength(bridgeData.steps.length + 2);
    expect(bars[1].base).toBeCloseTo(44_910.2);
    expect(bars[2].base).toBeCloseTo(44_910.2 + 2_330.6 - 2_210.1);
    expect(bars[2].height).toBeCloseTo(2_210.1);
  });

  it("gives bars stable ids: totals by year, steps by driver", () => {
    expect(waterfallBars(small).map((b) => b.id)).toEqual(["year:2025", "driver:activity", "driver:grid_and_renewables_s2", "driver:scope3", "year:2026"]);
    expect(barGroupId({ kind: "to", year: 2030 })).toBe("year:2030");
  });
});

describe("bridgeOption", () => {
  const opt = bridgeOption(small, t) as unknown as {
    xAxis: { data: string[] };
    tooltip: { formatter: (p: unknown) => string };
    series: { id: string; stack: string; data: { value: number; groupId: string; itemStyle?: { color: string } }[]; label?: { formatter: (p: unknown) => string }; universalTransition: unknown; tooltip?: { show: boolean } }[];
  };

  it("draws a helper stack under value bars, coloured by kind", () => {
    const [helper, values] = opt.series;
    expect(helper.id).toBe("bridge-helper");
    expect(helper.tooltip?.show).toBe(false);
    expect(helper.stack).toBe(values.stack);
    expect(helper.data.map((d) => d.value)).toEqual([0, 52_100, 51_800, 49_700, 0]);
    expect(values.data.map((d) => d.itemStyle?.color)).toEqual(["brand", "bad", "good", "good", "brand"]);
    expect(values.data.map((d) => d.groupId)).toEqual(["year:2025", "driver:activity", "driver:grid_and_renewables_s2", "driver:scope3", "year:2026"]);
    expect(values.universalTransition).toBeDefined();
    expect(opt.xAxis.data).toEqual(["2025", "More output", "Cleaner electricity", "Supply chain (Scope 3)", "2026"]);
  });

  it("labels bars with sign and puts the word in the tooltip", () => {
    const values = opt.series[1];
    expect(values.label!.formatter({ dataIndex: 1 })).toBe("+5,900.000");
    expect(values.label!.formatter({ dataIndex: 2 })).toBe("−6,200.000");
    expect(opt.tooltip.formatter({ dataIndex: 1 })).toBe("More output: +5,900.000 tCO₂e (increase)");
    expect(opt.tooltip.formatter({ dataIndex: 2 })).toBe("Cleaner electricity: −6,200.000 tCO₂e (decrease)");
    expect(opt.tooltip.formatter({ dataIndex: 0 })).toBe("2025 total: 52,100.000 tCO₂e");
  });

  it("colours by kind", () => {
    expect(barColor("increase", t)).toBe("bad");
    expect(barColor("decrease", t)).toBe("good");
    expect(barColor("from", t)).toBe("brand");
    expect(barTooltip(waterfallBars(small)[4])).toBe("2026 total: 49,700.000 tCO₂e");
  });
});

describe("table and aria", () => {
  it("lists totals and steps with the change and a word", () => {
    expect(bridgeTableRows(small)).toEqual([
      { step: "2025 total", change: "52,100.000", kind: "Total" },
      { step: "More output", change: "+5,900.000", kind: "Increase" },
      { step: "Cleaner electricity", change: "−6,200.000", kind: "Decrease" },
      { step: "Supply chain (Scope 3)", change: "−2,100.000", kind: "Decrease" },
      { step: "2026 total", change: "49,700.000", kind: "Total" },
    ]);
  });

  it("summarises in one sentence with server values", () => {
    expect(bridgeAriaLabel(small)).toBe("Emissions went from 52,100.000 tCO₂e in 2025 to 49,700.000 tCO₂e in 2026; the biggest driver was cleaner electricity (−6,200.000 tCO₂e).");
    expect(bridgeAriaLabel({ ...small, steps: [] })).toBe("Emissions went from 52,100.000 tCO₂e in 2025 to 49,700.000 tCO₂e in 2026.");
  });
});

describe("drawer inputs", () => {
  const years = { from: 2025, to: 2026 };
  it("names known keys with their year and shows unknown keys as sent", () => {
    expect(inputName("output_from", years)).toBe("Output (2025)");
    expect(inputName("kwh_per_t_to", years)).toBe("Electricity per tonne (kWh) (2026)");
    expect(inputName("t_per_kwh_from", years)).toBe("Electricity emission factor (tCO₂e per kWh) (2025)");
    expect(inputName("Q0", years)).toBe("Output (2025)");
    expect(inputName("QT", years)).toBe("Output (2026)");
    expect(inputName("L", years)).toBe("Log-mean of the two years' emissions, L");
    expect(inputName("ln_ratio", years)).toBe("Log of the driver's ratio, ln(driverᵀ / driver⁰)");
    expect(inputName("mystery_key", years)).toBe("mystery_key");
  });

  it("formats values for reading (display only)", () => {
    expect(inputValue(63_540)).toBe("63,540");
    expect(inputValue(0.304)).toBe("0.304");
    expect(inputValue(0.0007)).toBe("0.000700");
    expect(inputValue(0)).toBe("0");
    expect(inputRows(bridgeData.steps[0], years)).toEqual([
      { key: "output_from", name: "Output (2025)", value: "63,540" },
      { key: "output_to", name: "Output (2026)", value: "66,880" },
    ]);
    // #209: tCO₂e inputs to 3 decimals, so they read like the step's own −150.900; factors and log terms keep the display rule.
    expect(inputRows(bridgeData.steps[4], years).map((r) => r.value)).toEqual(["5,060.000", "4,910.000"]);
    const step = { ...bridgeData.steps[4], inputs: { scope3_from: 5_060.45, scope3_to: 4_909.55, saved_from: 12.5, scope2_change: -0.4, l: 4_800.2, tco2e_per_kwh_from: 0.00079 } };
    expect(inputRows(step, years).map((r) => [r.key, r.value])).toEqual([
      ["scope3_from", "5,060.450"],
      ["scope3_to", "4,909.550"],
      ["saved_from", "12.500"],
      ["scope2_change", "-0.400"],
      ["l", "4,800"],
      ["tco2e_per_kwh_from", "0.000790"],
    ]);
  });
});

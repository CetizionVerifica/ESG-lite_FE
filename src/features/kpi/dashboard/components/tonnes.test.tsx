// @vitest-environment jsdom
// #209 · A tCO₂e KPI figure shows exactly 3 decimals on the dashboard card and the ESG trend (its value, its target
// and its table view), even when the KPI's own `decimals` still say 2 (an edited or custom KPI keeps its decimals on
// the server). Other units keep their decimals. The FE only formats the server's numbers.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { KpiDashboardCard, KpiEsgTrend } from "../../../../lib/kpi/contracts";
import { TrendChart } from "../../esg/components/TrendChart";
import { KpiCard } from "./KpiCard";

vi.mock("echarts-for-react", () => ({ default: () => <div data-testid="echart" /> }));
vi.mock("../../../../theme", () => ({
  useChartTheme: () => ({
    color: ["series-1"],
    pillars: { environment: "env", social: "soc", governance: "gov" },
    tooltip: { backgroundColor: "panel", axisPointer: { lineStyle: { color: "line" } } },
  }),
}));

afterEach(cleanup);

const card = (over: Partial<KpiDashboardCard>): KpiDashboardCard => ({
  kpi_definition_id: 1,
  code: "GHG_SCOPE1",
  name: "Scope 1 emissions",
  topic: "climate",
  source: "auto",
  unit: "tCO₂e",
  decimals: 2,
  value: 123456.789,
  previous: null,
  change_pct: null,
  series: [],
  target: null,
  ...over,
});

const trend = (over: Partial<KpiEsgTrend>): KpiEsgTrend => ({
  pillar: "environment",
  topic: "climate",
  kpi_definition_id: 1,
  code: "GHG_SCOPE1_2",
  name: "GHG emissions, Scope 1 and 2",
  unit: "tCO2e",
  decimals: 2,
  direction_good: "down",
  series: [
    { period: "2026-01", period_start: "2026-01-01", label: "Jan 2026", value: 2341 },
    { period: "2026-02", period_start: "2026-02-01", label: "Feb 2026", value: 2315.6 },
  ],
  value: 4656.6,
  previous: null,
  change_pct: null,
  target: { progress_pct: null, status: null, label: null, value: 4200 },
  ...over,
});

describe("#209 · tCO₂e KPI figures with 3 decimals", () => {
  it("the dashboard card shows 3 decimals for tCO₂e, whatever the KPI's decimals", () => {
    render(<KpiCard card={card({})} year={2026} topic="Climate" target={null} />);
    expect(screen.getByTestId("kpi-card-value").textContent).toBe("123,456.789 tCO₂e");
    cleanup();
    render(<KpiCard card={card({ value: 4650.2, decimals: null })} year={2026} topic="Climate" target={null} />);
    expect(screen.getByTestId("kpi-card-value").textContent).toBe("4,650.200 tCO₂e");
  });

  it("the dashboard card keeps other units on their decimals", () => {
    render(<KpiCard card={card({ code: "WATER_WITHDRAWAL", name: "Water withdrawn", topic: "water", unit: "m³", decimals: 0, value: 31500 })} year={2026} topic="Water" target={null} />);
    expect(screen.getByTestId("kpi-card-value").textContent).toBe("31,500 m³");
  });

  it("a card's own target words name a tCO₂e figure with 3 decimals", () => {
    const target = { id: 1, company_id: 1, kpi_definition_id: 1, site_id: null, baseline_year: 2024, baseline_value: 0, target_year: 2030, target_value: 4200, direction: "reduce" as const, note: null, created_by: 13, current_value: null, current_year: null, progress_pct: null };
    render(<KpiCard card={card({})} year={2026} topic="Climate" target={target} />);
    expect(screen.getByTestId("kpi-target-progress").textContent).toContain("Down to 4,200.000 by 2030 from 2024");
  });

  it("the ESG trend shows its value, target and table view in tCO₂e with 3 decimals", async () => {
    const user = userEvent.setup();
    render(<TrendChart trend={trend({})} vsLabel="2025" />);
    expect(screen.getByTestId("esg-trend-value").textContent).toBe("4,656.600 tCO2e");
    expect(screen.getByRole("list", { name: "Legend" }).textContent).toContain("Target 4,200.000 tCO2e");
    await user.click(screen.getByRole("radio", { name: "Table" }));
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Value (tCO2e)" })).toBeTruthy();
    expect(within(table).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Jan 2026", "2,341.000", "4,200.000", "Feb 2026", "2,315.600", "4,200.000"]);
  });

  it("the ESG trend of another unit keeps its decimals", async () => {
    const user = userEvent.setup();
    render(<TrendChart trend={trend({ code: "WATER_WITHDRAWAL", name: "Water withdrawn", unit: "m³", decimals: 0, value: 31500, target: null, series: [{ period: "2026-01", period_start: "2026-01-01", label: "Jan 2026", value: 3400.4 }] })} vsLabel="2025" />);
    expect(screen.getByTestId("esg-trend-value").textContent).toBe("31,500 m³");
    await user.click(screen.getByRole("radio", { name: "Table" }));
    expect(within(screen.getByRole("table")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Jan 2026", "3,400"]);
  });
});

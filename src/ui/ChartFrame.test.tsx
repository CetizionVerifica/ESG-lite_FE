// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartFrame } from "./ChartFrame";

vi.mock("echarts-for-react", () => ({
  default: (props: { theme: { color: string[] } }) => <div data-testid="echart" data-colors={props.theme.color.join(",")} />,
}));

// The real hook reads ThemeProvider tokens; here we only check ChartFrame passes its result through.
vi.mock("../theme", () => ({
  useChartTheme: () => ({ color: ["series-1", "series-2"], tooltip: { backgroundColor: "panel" } }),
}));

afterEach(cleanup);

const table = {
  columns: [
    { id: "month", header: "Month" },
    { id: "t", header: "tCO₂e", numeric: true, decimals: 1 },
  ],
  rows: [
    { month: "Aug 2025", t: 1234.56 },
    { month: "Sep 2025", t: 980 },
  ],
};


describe("ChartFrame", () => {
  it("renders the chart with the token theme and switches to a table view", async () => {
    const user = userEvent.setup();
    render(<ChartFrame title="Emissions by month" unit="tCO₂e" option={{ series: [] }} table={table} exportName="by-month" />);
    expect(screen.getByTestId("echart").dataset.colors).toBe("series-1,series-2");
    expect(screen.getByRole("button", { name: /PNG/ })).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Table" }));
    expect(screen.getByRole("table", { name: "Emissions by month" })).toBeTruthy();
    expect(screen.getByText("1,234.6")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /PNG/ })).toBeNull();
  });

  it("passes the chart theme to an option builder", () => {
    const build = vi.fn(() => ({ series: [] }));
    render(<ChartFrame title="Scopes" option={build} />);
    expect(build).toHaveBeenCalledWith(expect.objectContaining({ color: ["series-1", "series-2"] }));
  });

  it("shows loading, empty and error states instead of the chart", async () => {
    const { rerender } = render(<ChartFrame title="T" option={{}} loading />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByTestId("echart")).toBeNull();
    rerender(<ChartFrame title="T" option={{}} empty emptyText="Nothing reported yet." />);
    expect(screen.getByText("Nothing reported yet.")).toBeTruthy();
    rerender(<ChartFrame title="T" option={{}} error="Couldn't load the chart." />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

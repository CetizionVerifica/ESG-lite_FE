// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MethodCards } from "./MethodCards";

afterEach(cleanup);

describe("MethodCards", () => {
  it("offers one radio per method, worded for the category, with a hint each", () => {
    const onChange = vi.fn();
    render(<MethodCards methods={["supplier_specific", "average_data", "spend_based"]} value="supplier_specific" onChange={onChange} ghgCategory={1} />);
    const group = screen.getByRole("group", { name: "How is this calculated?" });
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect((screen.getByRole("radio", { name: /Supplier's own figure/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("radio", { name: /Average for the material/ })).toBeTruthy();
    expect(screen.getByText(/Quickest, least exact/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /From the amount spent/ }));
    expect(onChange).toHaveBeenCalledWith("spend_based");
  });

  it("shows a single method as a read-only line", () => {
    render(<MethodCards methods={["direct_use"]} value="direct_use" onChange={() => {}} ghgCategory={11} />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByTestId("method-line").textContent).toContain("Calculated:Direct use (energy, fuel, gases)");
  });

  it("shows nothing without methods, and the server's error under the cards", () => {
    const { container, rerender } = render(<MethodCards methods={[]} value={null} onChange={() => {}} />);
    expect(container.textContent).toBe("");
    rerender(<MethodCards methods={["fuel_based", "distance_based"]} value="fuel_based" onChange={() => {}} error="This form offers: Distance travelled." />);
    expect(screen.getByText("This form offers: Distance travelled.")).toBeTruthy();
    expect(screen.getByRole("group").getAttribute("aria-invalid")).toBe("true");
  });
});

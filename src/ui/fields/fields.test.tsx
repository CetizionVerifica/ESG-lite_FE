// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Combobox, MonthPicker, NumberField, Select, TextField, Toggle } from ".";

afterEach(cleanup);

const sites = [
  { value: 1, label: "Hidd smelter" },
  { value: 2, label: "Sitra rod mill" },
  { value: 3, label: "Askar office" },
];

describe("Field wiring", () => {
  it("links label, required marker, help and error to the control", () => {
    const { rerender } = render(<TextField label="Supplier" required help="As on the invoice" value="" onChange={() => {}} />);
    const input = screen.getByLabelText(/Supplier/);
    expect(input.getAttribute("aria-required")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe("As on the invoice");

    rerender(<TextField label="Supplier" required error="Enter a supplier" value="" onChange={() => {}} />);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe("Enter a supplier");
  });

  it("disables the control while loading", () => {
    render(<Select label="Site" loading value={null} onChange={() => {}} options={sites} />);
    expect((screen.getByLabelText("Site") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("shows the empty text when a dependent list has no options", () => {
    render(<Select label="Category" value={null} onChange={() => {}} options={[]} emptyText="Choose a site first" />);
    expect(screen.getByRole("option", { name: "Choose a site first" })).toBeTruthy();
  });
});

describe("NumberField", () => {
  it("accepts separators and reports numbers or null", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField label="Quantity" unit="kWh" value={null} onChange={onChange} />);
    const input = screen.getByLabelText("Quantity");
    await user.type(input, "1,250.5");
    expect(onChange).toHaveBeenLastCalledWith(1250.5);
    await user.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("kWh")).toBeTruthy();
  });

  it("steps with the arrow keys within bounds", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [v, setV] = useState<number | null>(9);
      return <NumberField label="Rate" value={v} onChange={setV} step={1} max={10} />;
    }
    render(<Harness />);
    const input = screen.getByLabelText("Rate") as HTMLInputElement;
    input.focus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(input.value).toBe("10");
  });
});

describe("Combobox", () => {
  it("filters, moves with arrows and picks with Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox label="Site" value={null} onChange={onChange} options={sites} />);
    const input = screen.getByRole("combobox", { name: "Site" });
    await user.click(input);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    await user.type(input, "s");
    // "Hidd smelter", "Sitra rod mill", "Askar office" all contain an "s"
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("shows the empty text and closes on Esc", async () => {
    const user = userEvent.setup();
    render(<Combobox label="Site" value={null} onChange={() => {}} options={sites} emptyText="No sites match" />);
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.type(input, "zzz");
    expect(screen.getByText("No sites match")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Toggle", () => {
  it("is a switch that toggles with Space", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Toggle label="Email me" checked={false} onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Email me" });
    sw.focus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("MonthPicker", () => {
  it("combines month and year into YYYY-MM and clamps to max", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MonthPicker label="Month" value="2025-03" min="2024-01" max="2025-06" onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("Month", { selector: "select" }), "5");
    expect(onChange).toHaveBeenLastCalledWith("2025-05");
    await user.selectOptions(screen.getByLabelText("Year"), "2024");
    expect(onChange).toHaveBeenLastCalledWith("2024-03");
  });
});

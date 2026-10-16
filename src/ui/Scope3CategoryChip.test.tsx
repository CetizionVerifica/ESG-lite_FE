// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Scope3CategoryChip } from "./Scope3CategoryChip";

afterEach(cleanup);

describe("Scope3CategoryChip", () => {
  it("shows the number and short name, with the full name as its accessible name", () => {
    render(<Scope3CategoryChip n={6} />);
    expect(screen.getByLabelText("Category 6 · Business travel").textContent).toBe("6 · Business travel");
  });
  it("shows only the number when compact", () => {
    render(<Scope3CategoryChip n={12} compact />);
    expect(screen.getByLabelText("Category 12 · End-of-life treatment of sold products").textContent).toBe("12");
  });
  it("says Unmapped without a valid number", () => {
    const { rerender } = render(<Scope3CategoryChip n={null} />);
    expect(screen.getByText("Unmapped")).toBeTruthy();
    rerender(<Scope3CategoryChip n={16} />);
    expect(screen.getByText("Unmapped")).toBeTruthy();
  });
});

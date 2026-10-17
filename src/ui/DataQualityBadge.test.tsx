// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataQualityBadge } from "./DataQualityBadge";

afterEach(cleanup);

const fair = { technology: 2, geography: 1, time: 2, completeness: 1, reliability: 3, overall: 2, source: "auto" };

describe("DataQualityBadge", () => {
  it("shows the word, and names the five indicators in its accessible name", () => {
    render(<DataQualityBadge dq={fair} />);
    const badge = screen.getByTestId("dq-badge");
    expect(badge.textContent).toBe("Fair");
    expect(badge.getAttribute("aria-label")).toBe(
      "Data quality Fair. Technology: Fair, Geography: Good, Time: Fair, Completeness: Good, Reliability: Poor. Scored automatically.",
    );
    // A glyph beside the word, so the score never rests on colour.
    expect(badge.querySelector("svg")).not.toBeNull();
  });

  it("lists the indicators in a tooltip on focus", () => {
    render(<DataQualityBadge dq={fair} />);
    fireEvent.focus(screen.getByTestId("dq-badge"));
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Data quality: Fair · scored automatically");
    expect(tip.textContent).toContain("Reliability: Poor");
  });

  it("says when the score was entered by hand", () => {
    render(<DataQualityBadge dq={{ ...fair, overall: 1, source: "manual" }} />);
    expect(screen.getByTestId("dq-badge").textContent).toBe("Good· by hand");
  });

  it("says Not scored for no score or a broken one", () => {
    const { rerender } = render(<DataQualityBadge dq={null} />);
    expect(screen.getByText("Not scored")).toBeTruthy();
    rerender(<DataQualityBadge dq={{ overall: 2 }} />);
    expect(screen.getByText("Not scored")).toBeTruthy();
    expect(screen.queryByTestId("dq-badge")).toBeNull();
  });
});

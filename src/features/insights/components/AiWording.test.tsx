// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InsightCard } from "../../../lib/insights/contracts";
import { aiCardsData } from "../../../test/msw/insightsData";
import { CardWording, NaturalWordingToggle } from "./AiWording";

afterEach(cleanup);

const cards = aiCardsData(true).cards;
const byId = (id: string) => cards.find((c) => c.id === id) as InsightCard;
const RULE_DECOUPLING = "Output is up 42% since 2021 while emissions fell 19%.";

describe("CardWording (IN-9)", () => {
  it("shows the filled AI text with the AI label", () => {
    render(<CardWording card={byId("decoupling")} ruleText={RULE_DECOUPLING} />);
    const p = screen.getByTestId("card-wording");
    expect(p.dataset.source).toBe("ai");
    expect(p.textContent).toContain("Since 2021, output grew 42% and emissions dropped 19%.");
    expect(p.textContent).toContain("AI");
    expect(screen.getByRole("button", { name: "Show original" })).toBeTruthy();
  });

  it("'Show original' swaps to the rule copy and back", async () => {
    render(<CardWording card={byId("decoupling")} ruleText={RULE_DECOUPLING} />);
    await userEvent.click(screen.getByRole("button", { name: "Show original" }));
    const p = screen.getByTestId("card-wording");
    expect(p.textContent).toBe(RULE_DECOUPLING);
    expect(p.dataset.source).toBe("rule");
    const back = screen.getByRole("button", { name: "Show natural wording" });
    expect(back.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(back);
    expect(screen.getByTestId("card-wording").textContent).toContain("Since 2021");
  });

  it("falls back to the rule text without the label when the AI text is invalid", () => {
    const invalid = byId("renewables_jump");
    expect(invalid.source).toBe("ai");
    render(<CardWording card={invalid} ruleText="Renewable electricity rose from 31% to 47%." />);
    const p = screen.getByTestId("card-wording");
    expect(p.textContent).toBe("Renewable electricity rose from 31% to 47%.");
    expect(p.dataset.source).toBe("rule");
    expect(screen.queryByRole("button", { name: "Show original" })).toBeNull();
  });

  it("shows rule cards as they are", () => {
    render(<CardWording card={byId("pending_large")} ruleText="12 entries waiting for approval could change these figures." />);
    expect(screen.getByTestId("card-wording").textContent).toBe("12 entries waiting for approval could change these figures.");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("NaturalWordingToggle (IN-9)", () => {
  function Harness() {
    const [on, setOn] = useState(false);
    return <NaturalWordingToggle on={on} onChange={setOn} />;
  }

  it("is a labelled switch with the help line, toggled by click and keyboard", async () => {
    render(<Harness />);
    const sw = screen.getByRole("switch", { name: "Natural wording" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Reworded by AI from the same numbers. Numbers never change.")).toBeTruthy();
    await userEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    sw.focus();
    await userEvent.keyboard(" ");
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });
});

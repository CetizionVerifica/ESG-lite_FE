// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InfoTerm, InfoTip } from "./InfoTerm";
import { GLOSSARY, findTerm, glossaryEntry } from "./glossary";
import { KpiStrip } from "./KpiStrip";
import { DataTable } from "./table";
import { TextField } from "./fields";

afterEach(cleanup);

describe("glossary", () => {
  it("matches terms and aliases exactly, ignoring case and CO2 spelling", () => {
    expect(findTerm("Scope 1")).toBe("scope1");
    expect(findTerm("scope 2")).toBe("scope2");
    expect(findTerm("tCO2e")).toBe("tco2e");
    expect(findTerm("Emission factors")).toBe("emissionFactor");
    expect(findTerm("Scope 1 emissions")).toBeNull();
    expect(findTerm(42)).toBeNull();
  });

  it("never auto-matches manual entries such as status words", () => {
    expect(findTerm("Status")).toBeNull();
    expect(findTerm("Pending")).toBeNull();
    expect(glossaryEntry("pending")?.term).toBe("Pending");
  });

  it("has one short, plain definition per term and no duplicate spellings", () => {
    const seen = new Set<string>();
    for (const entry of Object.values(GLOSSARY)) {
      expect(entry.definition.length).toBeLessThanOrEqual(240);
      for (const s of [entry.term, ...("aliases" in entry ? entry.aliases : [])]) {
        const k = s.toLowerCase();
        expect(seen.has(k), s).toBe(false);
        seen.add(k);
      }
    }
  });
});

describe("InfoTip", () => {
  it("shows the definition on keyboard focus, linked by aria-describedby, and hides on Esc", async () => {
    const user = userEvent.setup();
    render(<InfoTip term="scope1" />);
    await user.tab();
    const button = screen.getByRole("button", { name: "What is Scope 1?" });
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain(GLOSSARY.scope1.definition);
    expect(button.getAttribute("aria-describedby")).toBe(tip.id);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on mouse hover and closes when the pointer leaves", async () => {
    const user = userEvent.setup();
    render(<InfoTip term="fera" />);
    await user.hover(screen.getByRole("button"));
    expect(screen.getByRole("tooltip").textContent).toContain("Fuel- and energy-related");
    await user.unhover(screen.getByRole("button"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("toggles on tap without opening and closing at once, and closes on a tap elsewhere", () => {
    render(
      <div>
        <InfoTip term="intensity" />
        <p>outside</p>
      </div>,
    );
    const button = screen.getByRole("button");
    // A touch tap: pointerdown, focus (some browsers), then click.
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.focus(button);
    fireEvent.click(button);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.pointerDown(screen.getByText("outside"), { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("doesn't trigger a clickable row around it", () => {
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <InfoTip term="tco2e" />
      </div>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onRow).not.toHaveBeenCalled();
  });

  it("takes a one-off definition", async () => {
    const user = userEvent.setup();
    render(<InfoTip label="Net zero" definition="Emissions cut as far as possible, the rest removed." />);
    await user.tab();
    expect(screen.getByRole("button", { name: "What is Net zero?" })).toBeTruthy();
    expect(screen.getByRole("tooltip").textContent).toBe("Net zero: Emissions cut as far as possible, the rest removed.");
  });
});

describe("InfoTerm", () => {
  it("adds the icon only for known terms", () => {
    render(
      <p>
        <InfoTerm>FERA</InfoTerm> and <InfoTerm>Electricity</InfoTerm>
      </p>,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "What is FERA?" })).toBeTruthy();
  });
});

describe("shared components pick up glossary terms", () => {
  it("KpiStrip labels, DataTable headers and field labels get an info button", () => {
    render(
      <>
        <KpiStrip items={[{ label: "Data coverage", value: 75, format: "percent" }, { label: "Electricity", value: 1 }]} />
        <DataTable
          label="Entries"
          rows={[{ id: 1, s: "pending", t: 2 }]}
          getRowId={(r) => r.id}
          columns={[
            { id: "t", header: "tCO₂e", numeric: true, sortable: true, value: (r) => r.t },
            { id: "s", header: "Status", info: "status", value: (r) => r.s },
          ]}
        />
        <TextField label="Emission factor" value="" onChange={() => {}} />
      </>,
    );
    expect(screen.getByRole("button", { name: "What is Data coverage?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "What is Electricity?" })).toBeNull();
    expect(screen.getByRole("button", { name: "What is tCO₂e?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "What is Status?" })).toBeTruthy();
    // The sort button keeps its own name, and the field's name stays the label alone.
    expect(screen.getByRole("button", { name: /^tCO₂e/ })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Emission factor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "What is Emission factor?" })).toBeTruthy();
  });
});

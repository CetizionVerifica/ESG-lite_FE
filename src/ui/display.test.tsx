// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Avatar } from "./Avatar";
import { Callout } from "./Callout";
import { initials } from "./initials";
import { KpiStrip } from "./KpiStrip";
import { Menu } from "./Menu";
import { ScopeBar } from "./ScopeBar";
import { SegmentedControl } from "./SegmentedControl";
import { TabPanel, Tabs } from "./Tabs";
import { ToastProvider } from "./Toast";
import { useToast } from "./toastStore";
import { Tooltip } from "./Tooltip";

afterEach(cleanup);

describe("KpiStrip", () => {
  it("prints figures with units and arrow deltas in the fixed tone", () => {
    render(
      <KpiStrip
        items={[
          { label: "Total emissions", value: 1234.5, previous: 1300, format: "emissions", compareLabel: "vs Aug 2025", primary: true },
          { label: "Electricity", value: 48200, previous: 40000, unit: "kWh" },
          { label: "Intensity", value: null, unit: "tCO₂e/t" },
        ]}
      />,
    );
    const total = screen.getByText("Total emissions").parentElement!;
    expect(within(total).getByText("1,235").textContent).toBe("1,235");
    expect(within(total).getByText("tCO₂e")).toBeTruthy();
    expect(within(total).getByText("▼ 5.0%").className).toContain("text-good");
    const elec = screen.getByText("Electricity").parentElement!;
    expect(within(elec).getByText("▲ 20.5%").className).toContain("text-bad");
    const intensity = screen.getByText("Intensity").parentElement!;
    expect(within(intensity).getByText("—")).toBeTruthy();
    expect(within(intensity).queryByText("tCO₂e/t")).toBeNull();
  });

  it("has loading and error variants", async () => {
    const retry = vi.fn();
    const { rerender } = render(<KpiStrip items={[]} loading />);
    expect(screen.getByRole("status")).toBeTruthy();
    rerender(<KpiStrip items={[]} error="Couldn't load figures." onRetry={retry} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });
});

describe("ScopeBar", () => {
  it("describes the split and shows the legend", () => {
    render(<ScopeBar totals={{ scope1: 50, scope2: 30, scope3: 20 }} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Emissions by scope: Scope 1 50%, Scope 2 30%, Scope 3 20%");
    expect(screen.getByText("50 tCO₂e")).toBeTruthy();
  });
  it("shows an empty state for zero totals", () => {
    render(<ScopeBar totals={{ scope1: 0, scope2: 0, scope3: 0 }} />);
    expect(screen.getByText("No emissions recorded for this period.")).toBeTruthy();
  });
});

describe("Tabs and SegmentedControl", () => {
  function Harness() {
    const [tab, setTab] = useState<"a" | "b" | "c">("a");
    const [seg, setSeg] = useState<"m" | "y">("m");
    return (
      <>
        <Tabs label="Entry" idBase="t" value={tab} onChange={setTab} items={[{ value: "a", label: "Details" }, { value: "b", label: "History", disabled: true }, { value: "c", label: "Files", count: 2 }]} />
        <TabPanel idBase="t" value="a" current={tab}>Details panel</TabPanel>
        <TabPanel idBase="t" value="c" current={tab}>Files panel</TabPanel>
        <SegmentedControl label="View" value={seg} onChange={setSeg} options={[{ value: "m", label: "Monthly" }, { value: "y", label: "Yearly" }]} />
      </>
    );
  }

  it("moves with arrow keys, skipping disabled tabs, and wires the panel", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("tab", { name: "Details" }).focus();
    await user.keyboard("{ArrowRight}");
    const files = screen.getByRole("tab", { name: /Files/ });
    expect(files.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(files);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(files.id);
    await user.keyboard("{Home}");
    expect(screen.getByText("Details panel")).toBeTruthy();
  });

  it("is a radiogroup with roving focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("radio", { name: "Monthly" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Yearly" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Monthly" }).tabIndex).toBe(-1);
  });
});

describe("Menu", () => {
  it("opens with ArrowDown, moves, selects with Enter, and Esc returns focus", async () => {
    const user = userEvent.setup();
    const edit = vi.fn();
    const remove = vi.fn();
    render(
      <Menu
        trigger={(p) => <button {...p}>Actions</button>}
        items={[
          { label: "Edit", onSelect: edit },
          { label: "Archive", onSelect: () => {}, disabled: true },
          { label: "Delete", onSelect: remove, danger: true },
        ]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Actions" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Edit" }));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Delete" }));
    await user.keyboard("{Enter}");
    expect(remove).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(edit).not.toHaveBeenCalled();
  });
});

describe("Toast", () => {
  function Fire({ onUndo }: { onUndo: () => void }) {
    const { toast } = useToast();
    return <button onClick={() => toast({ title: "Entry deleted", tone: "good", action: { label: "Undo", onClick: onUndo }, duration: 1000 })}>Go</button>;
  }

  it("runs the undo action and dismisses itself after its duration", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const undo = vi.fn();
    render(
      <ToastProvider>
        <Fire onUndo={undo} />
      </ToastProvider>,
    );
    await user.click(screen.getByText("Go"));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText("Entry deleted")).toBeNull();

    await user.click(screen.getByText("Go"));
    expect(screen.getByRole("status").textContent).toContain("Entry deleted");
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.queryByText("Entry deleted")).toBeNull();
    vi.useRealTimers();
  });
});

describe("primitives", () => {
  it("Tooltip shows on focus and links via aria-describedby", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Export as CSV">
        <button>Export</button>
      </Tooltip>,
    );
    await user.tab();
    const tip = screen.getByRole("tooltip");
    expect(screen.getByRole("button").getAttribute("aria-describedby")).toBe(tip.id);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("Tooltip keeps the child's own key handlers (Menu trigger still opens on ArrowDown)", async () => {
    const user = userEvent.setup();
    render(
      <Menu
        label="Row actions"
        items={[{ label: "Edit", onSelect: () => {} }]}
        trigger={(t) => (
          <Tooltip content="More actions">
            <button {...t}>More</button>
          </Tooltip>
        )}
      />,
    );
    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("Avatar falls back to initials", () => {
    expect(initials("Fatima Al-Sayed")).toBe("FS");
    expect(initials("ops@midal.com")).toBe("OC");
    expect(initials("  ")).toBe("?");
    render(<Avatar name="Fatima Al-Sayed" />);
    expect(screen.getByRole("img", { name: "Fatima Al-Sayed" }).textContent).toBe("FS");
  });

  it("Callout can be dismissed", async () => {
    const onDismiss = vi.fn();
    render(<Callout tone="warn" title="3 sites haven't reported" onDismiss={onDismiss} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

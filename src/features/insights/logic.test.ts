import { describe, expect, it } from "vitest";
import { PANEL_IDS } from "../../lib/insights/contracts";
import { SLOTS, SLOT_IDS, STORY_SLOTS, shellState, slotForPanel, storySlotsFor, tabsFor, yearOptions } from "./logic";

describe("Insights layout (05-ux §3)", () => {
  it("has a slot for every panel but the bridge, which shares the pathway slot", () => {
    // "By scope and site" (no KPI tracking) reads the flow panel too.
    const panels = SLOT_IDS.filter((s) => s !== "scopes").map((s) => SLOTS[s].panel);
    expect(new Set(panels).size).toBe(panels.length);
    expect(PANEL_IDS.filter((p) => !panels.includes(p))).toEqual(["bridge"]);
    expect(slotForPanel("bridge")).toBe("pathway");
    expect(slotForPanel("esg_ring")).toBe("ring");
    expect(slotForPanel("target_wall")).toBe("wall");
    expect(slotForPanel("flow")).toBe("flow");
    expect(slotForPanel(null)).toBeNull();
  });

  it("puts 'By scope and site' in Story 2 without KPI tracking", () => {
    expect(storySlotsFor(true)).toEqual(["decoupling", "ring", "pathway", "wall"]);
    expect(storySlotsFor(false)).toEqual(["decoupling", "scopes", "pathway", "wall"]);
    expect(SLOTS.scopes.span).toBe("xl:col-span-4");
  });

  it("lays the stories out 8/4 then 6/6", () => {
    expect(STORY_SLOTS.map((s) => SLOTS[s].span)).toEqual(["xl:col-span-8", "xl:col-span-4", "xl:col-span-6", "xl:col-span-6"]);
  });

  it("hides the Materiality tab without KPI tracking", () => {
    expect(tabsFor(true)).toEqual(["flow", "materiality", "completeness"]);
    expect(tabsFor(false)).toEqual(["flow", "completeness"]);
  });

  it("maps a query result to the shell's state; kpi_off hides", () => {
    expect(shellState({ isPending: true, isError: false })).toBe("loading");
    expect(shellState({ isPending: false, isError: true })).toBe("error");
    expect(shellState({ isPending: false, isError: false, data: { availability: "ok" } })).toBe("ok");
    expect(shellState({ isPending: false, isError: false, data: { availability: "kpi_off" } })).toBe("hidden");
    expect(shellState({ isPending: false, isError: false, data: { availability: "no_data" } })).toBe("empty");
    expect(shellState({ isPending: false, isError: false, data: { availability: "setup_incomplete" } })).toBe("empty");
    // A refetch error keeps the previous data on screen.
    expect(shellState({ isPending: false, isError: true, data: { availability: "ok" } })).toBe("ok");
  });

  it("offers years from this one back to 2019", () => {
    expect(yearOptions(2026)).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]);
    expect(yearOptions(2018)).toEqual([2018]);
  });
});

import { describe, expect, it } from "vitest";
import { RULE_IDS, RULES, type CardSeverity, type InsightCard, type RuleId } from "./contracts";
import { CARD_COPY, cardText, num } from "./cardCopy";

const card = (rule: RuleId, params: InsightCard["params"], severity: CardSeverity = RULES[rule].severities[0]) => ({ rule, params, severity });

/** One realistic card per rule, with the sentence it must read. */
const CASES: { rule: RuleId; params: InsightCard["params"]; severity?: CardSeverity; text: string }[] = [
  { rule: "decoupling", params: { output_pct: 42, emissions_pct: 19, base_year: 2021 }, text: "Output is up 42% since 2021 while emissions fell 19%." },
  { rule: "largest_source", params: { category: "Purchased electricity", share_pct: 44 }, text: "Purchased electricity is 44% of your footprint." },
  { rule: "site_concentration", params: { site: "Pune plant", scope: 2, share_pct: 61 }, text: "Pune plant is 61% of Scope 2." },
  { rule: "pathway_gap", params: { gap_pct: 3.4, target_year: 2030 }, text: "Emissions are 3.4% above the 2030 pathway." },
  { rule: "pathway_on_track", params: { margin_pct: 6.5 }, text: "You're 6.5% below your pathway this year." },
  { rule: "target_off_track", params: { count: 3, first_name: "Water withdrawal" }, text: "3 targets are off track, including Water withdrawal." },
  { rule: "renewables_jump", params: { from_pct: 31, to_pct: 47 }, text: "Renewable electricity rose from 31% to 47%." },
  { rule: "intensity_change", params: { change_pct: -12, unit: "t" }, severity: "good", text: "Intensity fell 12% (tCO₂e per t)." },
  { rule: "biggest_mover", params: { name: "Women in management", change_pct: 18 }, severity: "good", text: "Women in management is up 18% on last year." },
  { rule: "coverage_gap", params: { pillar: "social", pct: 54, missing: 12 }, text: "Social data is 54% complete: 12 values missing." },
  { rule: "pending_large", params: { count: 1250, link: "/data/approvals" }, text: "1,250 entries waiting for approval could change these figures." },
];

/** Every number printed in the text (thousands separators removed). */
const numbersIn = (text: string) => (text.match(/\d[\d,]*(\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
/** Every number the server sent, as it would print without a sign. */
const numbersOf = (params: InsightCard["params"]) =>
  Object.values(params).flatMap((v) => (typeof v === "number" ? [String(Math.abs(v))] : numbersIn(String(v))));

describe("cardCopy (IN-3, 01-contracts §6)", () => {
  it("has a template for every rule", () => {
    expect(Object.keys(CARD_COPY).sort()).toEqual([...RULE_IDS].sort());
    expect(CASES.map((c) => c.rule).sort()).toEqual([...RULE_IDS].sort());
  });

  it.each(CASES)("$rule reads in plain words", ({ rule, params, severity, text }) => {
    expect(cardText(card(rule, params, severity))).toBe(text);
  });

  it.each(CASES)("$rule prints no number the server didn't send", ({ rule, params, severity }) => {
    const sent = new Set(numbersOf(params));
    for (const n of numbersIn(cardText(card(rule, params, severity))!)) expect(sent, `${rule}: ${n}`).toContain(n);
  });

  it("prints params as given, adding only thousands separators; years and scopes stay plain", () => {
    expect(num(12345)).toBe("12,345");
    expect(num(3.4)).toBe("3.4");
    expect(num(0.25)).toBe("0.25");
    expect(num(-19)).toBe("19");
    expect(num("12")).toBe("12");
    expect(cardText(card("pathway_gap", { gap_pct: 12, target_year: 2030 }))).toBe("Emissions are 12% above the 2030 pathway.");
  });

  it("intensity_change: the severity picks fell/rose (lower is good); otherwise the server's sign", () => {
    expect(cardText(card("intensity_change", { change_pct: 7.5, unit: "t" }, "attention"))).toBe("Intensity rose 7.5% (tCO₂e per t).");
    expect(cardText(card("intensity_change", { change_pct: 12, unit: "MWh" }, "good"))).toBe("Intensity fell 12% (tCO₂e per MWh).");
    expect(cardText(card("intensity_change", { change_pct: 12, unit: "t" }, "attention"))).toBe("Intensity rose 12% (tCO₂e per t).");
    expect(cardText(card("intensity_change", { change_pct: -12, unit: "t" }, "good"))).toBe("Intensity fell 12% (tCO₂e per t).");
    expect(cardText(card("intensity_change", { change_pct: -6, unit: "t" }, "info"))).toBe("Intensity fell 6% (tCO₂e per t).");
    expect(cardText(card("intensity_change", { change_pct: 6, unit: "t" }, "info"))).toBe("Intensity rose 6% (tCO₂e per t).");
  });

  it("biggest_mover says up or down by the server's sign, 'changed' without one", () => {
    expect(cardText(card("biggest_mover", { name: "Water use", change_pct: -22 }, "good"))).toBe("Water use is down 22% on last year.");
    expect(cardText(card("biggest_mover", { name: "Water use", change_pct: 0 }, "good"))).toBe("Water use changed 0% on last year.");
  });

  it("uses the singular for one", () => {
    expect(cardText(card("target_off_track", { count: 1, first_name: "Lost-time injury frequency rate" }))).toBe("1 target is off track: Lost-time injury frequency rate.");
    expect(cardText(card("pending_large", { count: 1, link: "/data/approvals" }))).toBe("1 entry waiting for approval could change these figures.");
    expect(cardText(card("coverage_gap", { pillar: "governance", pct: 40, missing: 1 }))).toBe("Governance data is 40% complete: 1 value missing.");
  });

  it("an unknown pillar key is capitalised, not dropped", () => {
    expect(cardText(card("coverage_gap", { pillar: "climate", pct: 40, missing: 2 }))).toBe("Climate data is 40% complete: 2 values missing.");
  });

  it("returns null for an unknown rule or a missing param (pending_large's link isn't printed, so it isn't needed)", () => {
    expect(cardText({ rule: "made_up" as RuleId, params: {}, severity: "info" })).toBeNull();
    expect(cardText(card("decoupling", { output_pct: 42, emissions_pct: 19 }))).toBeNull();
    expect(cardText(card("largest_source", { category: "", share_pct: 44 }))).toBeNull();
    expect(cardText(card("pending_large", { count: 3 }))).toBe("3 entries waiting for approval could change these figures.");
  });
});

import { describe, expect, it } from "vitest";
import { aiCardsData, cardsData } from "../../test/msw/insightsData";
import { aiTextUsable, fillTokens, paramText, tokenKeys } from "./aiText";
import { AI_TEXT_MAX, RULES, RULE_IDS, type InsightCard } from "./contracts";

const card = (over: Partial<InsightCard> = {}): InsightCard => ({
  id: "decoupling",
  rule: "decoupling",
  severity: "good",
  source: "ai",
  params: { output_pct: 42, emissions_pct: 19, base_year: 2021 },
  text: "Since {{v:base_year}}, output grew {{v:output_pct}}% and emissions dropped {{v:emissions_pct}}%.",
  link: null,
  ...over,
});

describe("fillTokens (IN-9)", () => {
  it("substitutes every token from the params", () => {
    const c = card();
    expect(fillTokens(c.text!, c.params)).toBe("Since 2021, output grew 42% and emissions dropped 19%.");
  });

  it("keeps the decimals the server gave and adds thousands separators", () => {
    expect(fillTokens("{{v:a}} / {{v:b}} / {{v:c}} / {{v:d}}", { a: 3.4, b: 12_500, c: 1234.25, d: 0.5 })).toBe("3.4 / 12,500 / 1,234.25 / 0.5");
  });

  it("prints years plainly and strings as given", () => {
    expect(fillTokens("{{v:target_year}} {{v:base_year}} {{v:category}}", { target_year: 2030, base_year: 2021, category: "Purchased electricity" })).toBe("2030 2021 Purchased electricity");
  });

  it("repeats a token and leaves text without tokens alone", () => {
    expect(fillTokens("{{v:x}} and {{v:x}}", { x: 7 })).toBe("7 and 7");
    expect(fillTokens("No figures here.", { x: 7 })).toBe("No figures here.");
  });

  it("shows a missing param as a dash, never a made-up number", () => {
    expect(fillTokens("{{v:gone}}%", {})).toBe("—%");
    expect(paramText("x", Number.NaN)).toBe("—");
  });

  it("lists the token keys in order", () => {
    expect(tokenKeys(card().text!)).toEqual(["base_year", "output_pct", "emissions_pct"]);
  });
});

describe("aiTextUsable (IN-9)", () => {
  it("accepts a valid AI text", () => {
    expect(aiTextUsable(card())).toBe(true);
  });

  it("needs source 'ai' and a string text", () => {
    expect(aiTextUsable(card({ source: "rule" }))).toBe(false);
    expect(aiTextUsable(card({ text: undefined }))).toBe(false);
    expect(aiTextUsable(card({ text: 42 as unknown as string }))).toBe(false);
    expect(aiTextUsable(card({ text: "   " }))).toBe(false);
  });

  it("rejects text longer than AI_TEXT_MAX", () => {
    const base = card().text!;
    expect(aiTextUsable(card({ text: base + " ".repeat(AI_TEXT_MAX - base.length) }))).toBe(true);
    expect(aiTextUsable(card({ text: base + "x".repeat(AI_TEXT_MAX - base.length + 1) }))).toBe(false);
  });

  it("rejects a missing required token", () => {
    expect(aiTextUsable(card({ text: "Output grew {{v:output_pct}}% and emissions dropped {{v:emissions_pct}}%." }))).toBe(false);
  });

  it("rejects an unknown token, or one the card has no value for", () => {
    expect(aiTextUsable(card({ text: card().text! + " {{v:share_pct}}" }))).toBe(false);
    expect(aiTextUsable(card({ params: { output_pct: 42, emissions_pct: 19 } }))).toBe(false);
  });

  it("never lets the link into the text, and doesn't require it", () => {
    const pending = card({ id: "pending_large", rule: "pending_large", severity: "attention", params: { count: 12, link: "/data/approvals" }, link: "/data/approvals" });
    expect(aiTextUsable({ ...pending, text: "{{v:count}} entries still need a look before these figures settle." })).toBe(true);
    expect(aiTextUsable({ ...pending, text: "{{v:count}} entries still need a look: {{v:link}}" })).toBe(false);
  });

  it("rejects digits outside tokens", () => {
    expect(aiTextUsable(card({ text: card().text! + " In 2 years." }))).toBe(false);
    expect(aiTextUsable(card({ text: "Since 2021, output grew {{v:output_pct}}% and emissions dropped {{v:emissions_pct}}%." }))).toBe(false);
  });

  it("rejects malformed tokens and stray braces", () => {
    expect(aiTextUsable(card({ text: card().text!.replace("{{v:output_pct}}", "{{output_pct}}") }))).toBe(false);
    expect(aiTextUsable(card({ text: card().text! + " {v:x}" }))).toBe(false);
  });

  it("rejects an unknown rule", () => {
    expect(aiTextUsable(card({ rule: "made_up" as InsightCard["rule"] }))).toBe(false);
  });

  it("accepts text with every required token for every rule", () => {
    for (const rule of RULE_IDS) {
      const keys = RULES[rule].params.filter((k) => k !== "link");
      const params = Object.fromEntries(RULES[rule].params.map((k) => [k, k === "link" ? "/x" : 5]));
      expect(aiTextUsable(card({ rule, params, text: keys.map((k) => `{{v:${k}}}`).join(" and ") + "." })), rule).toBe(true);
    }
  });

  it("matches the mock: the AI cards with one deliberately invalid text", () => {
    const usable = aiCardsData(true).cards.filter((c) => aiTextUsable(c)).map((c) => c.id);
    expect(usable).toEqual(["pathway_gap", "decoupling", "largest_source"]);
    expect(aiCardsData(true).cards.find((c) => c.id === "renewables_jump")?.source).toBe("ai");
    expect(cardsData(true).cards.some((c) => aiTextUsable(c))).toBe(false);
  });
});

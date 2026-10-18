import { describe, expect, it } from "vitest";
import type { KpiValue, MyKpiItem } from "../../../lib/kpi/contracts";
import type { AiSuggestion } from "./logic";
import {
  defaultPeriod,
  draftFromValue,
  groupItems,
  hasAnswer,
  itemKey,
  nextDueDate,
  nextItem,
  progressOf,
  questionItem,
  readyToSubmit,
  submitQuestion,
  toValueInput,
  gridDraft,
  matchSuggestions,
  suggestionChip,
  suggestionFill,
  parseCell,
  topicChips,
  topicFilter,
  topicGroups,
  withValue,
  workOrder,
} from "./logic";

const value = (over: Partial<KpiValue> = {}): KpiValue =>
  ({ id: 1, status: "draft", value_numeric: 10, value_text: null, unit: "m³", breakdown: null, is_estimate: false, comment: null, review_comment: null, updated_at: "2026-10-01", ...over }) as KpiValue;

const item = (over: Partial<MyKpiItem> = {}): MyKpiItem =>
  ({
    kpi_definition_id: 13,
    code: "WATER_WITHDRAWAL",
    name: "Water withdrawn",
    question: "How much water did {site} take in during {period}?",
    help: null,
    topic: "water",
    source: "manual",
    value_type: "number",
    canonical_unit: "m³",
    allowed_units: ["m³", "kL"],
    site_id: 1,
    site_name: "Bahrain plant",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    frequency: "monthly",
    due_date: "2026-10-15",
    group: "due",
    value: null,
    last_value: { value: 1050, unit: "m³", period_start: "2025-09-01" },
    used_in: [{ framework: "GRI", code: "303-3" }],
    breakdowns: { by: ["source"], values: ["groundwater", "surface"] },
    reviewer_name: "Mia Haddad",
    ...over,
  }) as MyKpiItem;

const ITEMS: MyKpiItem[] = [
  item({ kpi_definition_id: 1, name: "Scope 1 emissions", topic: "climate", source: "auto", group: "done", value: value({ status: "approved" }) }),
  item({ kpi_definition_id: 13, name: "Water withdrawn", group: "sent_back", value: value({ status: "rejected", review_comment: "Split it" }) }),
  item({ kpi_definition_id: 14, name: "Water discharged", group: "due", value: value({ id: 2 }) }),
  item({ kpi_definition_id: 15, name: "Waste generated", topic: "waste", group: "due", due_date: "2026-10-15" }),
  item({ kpi_definition_id: 18, name: "NOx emitted", topic: "pollution", topic_label: "Air and pollution", group: "due", due_date: "2026-10-15" }),
  item({ kpi_definition_id: 16, name: "Waste recovered", topic: "waste", group: "done", value: value({ id: 3, status: "pending" }) }),
  item({ kpi_definition_id: 11, name: "Water consumed", source: "formula", group: "done" }),
];

describe("My KPIs grouping and progress", () => {
  it("groups entered KPIs by status and keeps auto and calculated apart", () => {
    const g = groupItems(ITEMS);
    expect(g.due.map((i) => i.name)).toEqual(["NOx emitted", "Waste generated", "Water discharged"]);
    expect(g.sentBack.map((i) => i.name)).toEqual(["Water withdrawn"]);
    expect(g.done.map((i) => i.name)).toEqual(["Waste recovered"]);
    expect(g.filled.map((i) => i.name)).toEqual(["Scope 1 emissions", "Water consumed"]);
  });

  it("counts auto and calculated as done (05-ux: 7 of 12 done)", () => {
    expect(progressOf(ITEMS)).toEqual({ done: 3, total: 7, pct: 43 });
    expect(progressOf([])).toEqual({ done: 0, total: 0, pct: 0 });
  });

  it("walks the to-do rows in the order shown: by topic, sent back first; Save and next stops at the end", () => {
    expect(workOrder(ITEMS).map((i) => i.name)).toEqual(["Water withdrawn", "Water discharged", "Waste generated", "NOx emitted"]);
    expect(nextItem(ITEMS, itemKey(ITEMS[1]))?.name).toBe("Water discharged");
    expect(nextItem(ITEMS, itemKey(ITEMS[4]))).toBeNull();
  });

  it("groups rows under topic headings with progress over the whole topic, and reads ?topic= safely (D17)", () => {
    const todo = ITEMS.filter((i) => i.group !== "done");
    const groups = topicGroups(todo, ITEMS);
    expect(groups.map((g) => [g.label, g.items.length, g.done, g.total])).toEqual([
      ["Water", 2, 1, 3],
      ["Waste", 1, 1, 2],
      ["Air and pollution", 1, 0, 1],
    ]);
    expect(topicChips(ITEMS).map((c) => `${c.label} ${c.count}`)).toEqual(["Climate 1", "Water 3", "Waste 2", "Air and pollution 1"]);
    expect(topicFilter("waste", ITEMS)).toBe("waste");
    expect(topicFilter("biodiversity", ITEMS)).toBeNull();
    expect(topicFilter(null, ITEMS)).toBeNull();
  });

  it("submits drafts that have an answer, and says to whom", () => {
    expect(readyToSubmit(ITEMS).map((i) => i.name)).toEqual(["Water discharged"]);
    expect(submitQuestion(readyToSubmit(ITEMS))).toBe("Send 1 value to Mia Haddad for review?");
    expect(submitQuestion([item({ reviewer_name: null }), item({ reviewer_name: null })])).toBe("Send 2 values to your reviewer for review?");
    expect(submitQuestion([item(), item({ reviewer_name: "Omar Saleh" })])).toBe("Send 2 values to Mia Haddad and Omar Saleh for review?");
    expect(hasAnswer(value({ value_numeric: null, value_text: " " }))).toBe(false);
    expect(hasAnswer(value({ value_numeric: 0 }))).toBe(true);
  });

  it("finds the next due date and last month", () => {
    expect(nextDueDate(ITEMS)).toBe("2026-10-15");
    expect(defaultPeriod(new Date(2026, 9, 17))).toEqual({ year: 2026, month: 9 });
    expect(defaultPeriod(new Date(2026, 0, 5))).toEqual({ year: 2025, month: 12 });
  });
});

describe("draft and value", () => {
  it("asks the plain question with last year's figure", () => {
    const q = questionItem(item());
    expect(q.question).toBe("How much water did Bahrain plant take in during September 2026?");
    expect(q.last).toEqual({ label: "Last September", value: 1050, unit: "m³" });
  });

  it("maps a saved value to the card and back", () => {
    const i = item({ value: value({ value_numeric: 1200, unit: "kL", breakdown: { groundwater: 700 }, is_estimate: true, comment: "Meter fixed" }) });
    const d = draftFromValue(i);
    expect(d).toEqual({ value: 1200, text: "", unit: "kL", breakdown: { groundwater: 700, surface: null }, isEstimate: true, comment: "Meter fixed" });
    expect(toValueInput(i, d)).toEqual({
      kpi_definition_id: 13,
      site_id: 1,
      period_start: "2026-09-01",
      frequency: "monthly",
      value_numeric: 1200,
      value_text: null,
      unit: "kL",
      breakdown: { groundwater: 700 },
      is_estimate: true,
      comment: "Meter fixed",
    });
    expect(draftFromValue(item()).unit).toBe("m³");
    expect(toValueInput(item({ value_type: "text" }), { ...d, text: " A note " })).toMatchObject({ value_numeric: null, value_text: "A note", unit: null });
  });

  it("puts a saved value into the list and regroups it", () => {
    const next = withValue(ITEMS, itemKey(ITEMS[1]), value({ status: "draft" }));
    expect(next[1].group).toBe("due");
    expect(withValue(ITEMS, itemKey(ITEMS[3]), value({ status: "pending" }))[3].group).toBe("done");
  });
});

describe("My KPIs table view (KPI-7 part 3)", () => {
  it("checks a typed cell the way the card does", () => {
    const num = { value_type: "number" as const };
    expect(parseCell("1,200", num)).toEqual({ value: 1200, error: null });
    expect(parseCell("  ", num)).toEqual({ value: null, error: null });
    expect(parseCell("12a", num).error).toBe("Type a number, like 1200.");
    expect(parseCell("2.5", { value_type: "integer" }).error).toBe("Type a whole number.");
    expect(parseCell("140", { value_type: "percent" }).error).toBe("A percentage is between 0 and 100.");
    expect(parseCell("40", { value_type: "percent" })).toEqual({ value: 40, error: null });
  });

  it("saves a cell on top of the draft that's there", () => {
    const i = item({ value: value({ value_numeric: 10, unit: "kL", comment: "meter 2" }) });
    expect(gridDraft(i, 12, "kL")).toMatchObject({ value: 12, unit: "kL", comment: "meter 2" });
    expect(gridDraft(item(), 5, "")).toMatchObject({ value: 5, unit: "m³" });
  });
});

describe("My KPIs AI suggestions (KPI-12)", () => {
  const sug = (over: Partial<AiSuggestion> = {}): AiSuggestion => ({
    id: "s1",
    documentName: "water-bill.pdf",
    kpi_code: "WATER_WITHDRAWAL",
    value: 1200,
    unit: "m³",
    breakdown_key: null,
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    site_hint: "Bahrain plant",
    source_page: 2,
    quote: "Water consumed: 1,200 m³",
    confidence: 0.92,
    why: null,
    ...over,
  });

  it("puts a suggestion on its KPI's card for that period, never on done or auto rows", () => {
    const water = ITEMS[1];
    const m = matchSuggestions(ITEMS, [sug(), sug({ id: "s2", kpi_code: "GHG_SCOPE1" }), sug({ id: "s3", kpi_code: "WASTE_RECOVERED", kpi_definition_id: 16 }), sug({ id: "s4", kpi_code: "UNKNOWN" })]);
    expect([...m.keys()]).toEqual([itemKey(water)]);
    expect(m.get(itemKey(water))?.map((s) => s.id)).toEqual(["s1"]);
  });

  it("Use fills the total, a split line, or text, and stops at a unit the KPI doesn't take", () => {
    const water = item();
    const d = draftFromValue(water);
    expect(suggestionFill(water, sug(), d)).toEqual({ patch: { value: 1200, unit: "m³" } });
    expect(suggestionFill(water, sug({ value: "700", breakdown_key: "groundwater" }), d)).toEqual({ patch: { breakdown: { groundwater: 700, surface: null } } });
    expect(suggestionFill(water, sug({ breakdown_key: "rain" }), d)).toHaveProperty("blocked");
    expect(suggestionFill(water, sug({ unit: "gal" }), d)).toEqual({ blocked: "The document says gal, which this KPI doesn't take. Type the value yourself." });
    expect(suggestionFill(item({ value_type: "yes_no" }), sug({ value: "Yes", unit: null }), d)).toEqual({ patch: { text: "yes" } });
    expect(suggestionFill(item({ value_type: "text" }), sug({ value: "Policy updated", unit: null }), d)).toEqual({ patch: { text: "Policy updated" } });
  });

  it("labels the chip with the value, the source page and Check this below 0.6", () => {
    const water = item();
    const chip = suggestionChip(water, sug({ confidence: 0.55, breakdown_key: "groundwater", value: 700 }), draftFromValue(water));
    expect(chip).toMatchObject({ label: "Groundwater: 700 m³", source: "Suggested from water-bill.pdf, page 2", check: true, blocked: null });
    expect(suggestionChip(water, sug(), draftFromValue(water)).check).toBe(false);
  });
});

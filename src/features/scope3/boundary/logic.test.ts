import { describe, expect, it } from "vitest";
import type { BoundaryCategory, MapProposal } from "../../../services/scope3Service";
import {
  bulkConfirmable,
  confidenceText,
  isUnconfirmedDefault,
  countStatuses,
  draftFrom,
  isRowDirty,
  lastChanged,
  rowError,
  summaryLine,
  toBody,
} from "./logic";

const cat = (over: Partial<BoundaryCategory> = {}): BoundaryCategory => ({
  n: 14,
  key: "franchises",
  name: "Franchises",
  direction: "downstream",
  methods: [],
  status: "not_relevant",
  reason: "No franchises",
  method_note: null,
  relevance: null,
  updated_at: null,
  updated_by: null,
  mapped_categories: [],
  ...over,
});

const prop = (over: Partial<MapProposal>): MapProposal => ({
  category_id: 1,
  category_name: "X",
  ghg_category: null,
  proposed: 4,
  confidence: 75,
  basis: "keyword",
  confirmed: false,
  ...over,
});

describe("boundary drafts", () => {
  it("starts from the saved row and ignores surrounding spaces", () => {
    const c = cat();
    const d = draftFrom(c);
    expect(isRowDirty(d, c)).toBe(false);
    expect(isRowDirty({ ...d, reason: " No franchises " }, c)).toBe(false);
    expect(isRowDirty({ ...d, status: "excluded" }, c)).toBe(true);
  });

  it("excluded and not relevant need a reason; included and screening don't", () => {
    expect(rowError({ status: "excluded", reason: "  ", method_note: "" })).toMatch(/reason/);
    expect(rowError({ status: "not_relevant", reason: "", method_note: "" })).toMatch(/not relevant/);
    expect(rowError({ status: "included", reason: "", method_note: "" })).toBeNull();
    expect(rowError({ status: "screening", reason: "", method_note: "" })).toBeNull();
  });

  it("sends trimmed text and null for empty fields", () => {
    expect(toBody({ status: "included", reason: " ", method_note: " Spend based " })).toEqual({
      status: "included",
      reason: null,
      method_note: "Spend based",
    });
  });
});

describe("summary line", () => {
  it("reads like the spec and adds screening only when there is any", () => {
    const c = countStatuses([...Array(11).fill("included"), "excluded", "excluded", "not_relevant", "not_relevant"]);
    expect(summaryLine(c)).toBe("11 included · 2 excluded · 2 not relevant");
    expect(summaryLine(countStatuses(["included", "screening"]))).toBe("1 included · 0 excluded · 0 not relevant · 1 screening");
  });
});

describe("unmapped proposals", () => {
  it("confirm all takes proposals at 90 % or more with a number", () => {
    const list = [prop({ category_id: 1, confidence: 95 }), prop({ category_id: 2, confidence: 89 }), prop({ category_id: 3, proposed: null, confidence: 90 })];
    expect(bulkConfirmable(list).map((p) => p.category_id)).toEqual([1]);
  });
  it("shows the confidence or No match", () => {
    expect(confidenceText(prop({ confidence: 85 }))).toBe("85 %");
    expect(confidenceText(prop({ proposed: null, confidence: 0 }))).toBe("No match");
  });
});

describe("last changed", () => {
  it("names the person and the day", () => {
    expect(lastChanged({ updated_at: "2026-10-12T10:00:00Z", updated_by: { user_id: 3, name: "Priya" } })).toBe("12 Oct 2026, by Priya");
    expect(lastChanged({ updated_at: null, updated_by: null })).toBe("Not changed yet");
  });
});

// S3-11 (D10)
describe("isUnconfirmedDefault", () => {
  it("is a 13-15 Not relevant row nobody has saved", () => {
    expect(isUnconfirmedDefault({ n: 14, status: "not_relevant", updated_by: null })).toBe(true);
    expect(isUnconfirmedDefault({ n: 14, status: "not_relevant", updated_by: { user_id: 3, name: "Priya" } })).toBe(false);
    expect(isUnconfirmedDefault({ n: 12, status: "not_relevant", updated_by: null })).toBe(false);
    expect(isUnconfirmedDefault({ n: 15, status: "screening", updated_by: null })).toBe(false);
  });
});

import type { MappingProposal } from "./types";

/**
 * A mocked mapping proposal for a two-sheet workbook of Hidd (site 1):
 * a fuel sheet with one low-confidence activity and a second site in its site
 * column, and an electricity sheet remembered from a profile. Used by the unit
 * tests and the Playwright smoke test until `/v1/excel/propose` (XI2) is live.
 */
export const FINGERPRINT_FUEL = "a".repeat(64);
export const FINGERPRINT_POWER = "b".repeat(64);

export const MOCK_PROPOSAL: MappingProposal = {
  document_id: 42,
  site_id: 1,
  model: { name: "mock", calls: 1, cached_profile_hits: 1 },
  sheets: [
    {
      sheet_name: "Fuel 2026",
      fingerprint: FINGERPRINT_FUEL,
      header_row: 2,
      data_rows: 48,
      layout: "rows",
      site_id: 1,
      site_column: {
        column: "Plant",
        values: [
          { text: "Hidd", matches_site: true },
          { text: "Askar", matches_site: false },
        ],
      },
      category: { kind: "fixed", id: 1, label: "Fuel", confidence: 0.96, source: "rules" },
      period: { kind: "column", column: "Month" },
      fields: [
        { key: "activity_value", label: "Quantity", required: true, column: "Litres used", confidence: 0.92, source: "llm", skipped: false },
        { key: "activity_unit", label: "Unit", required: true, column: null, confidence: 0, source: "rules", skipped: false },
        { key: "extra_invoice", label: "Invoice number", required: false, column: "Inv #", confidence: 0.7, source: "llm", skipped: false },
      ],
      activities: [
        { sheet_text: "Diesel (gen-set)", category_id: 1, factor_name: "Diesel", confidence: 0.97, source: "rules", save_mapping: false },
        { sheet_text: "Gasoline 95", category_id: 1, factor_name: "Petrol", confidence: 0.64, source: "llm", save_mapping: false },
      ],
      not_in_context: ["Plant 9"],
      confidence: 0.64,
      source: "mixed",
      excluded: false,
    },
    {
      sheet_name: "Power",
      fingerprint: FINGERPRINT_POWER,
      header_row: 1,
      data_rows: 12,
      layout: "months_as_columns",
      site_id: 1,
      site_column: null,
      category: { kind: "fixed", id: 3, label: "Electricity", confidence: 1, source: "profile" },
      period: {
        kind: "months_as_columns",
        columns: [
          { column: "Jan", date: "2026-01-31" },
          { column: "Feb", date: "2026-02-28" },
          { column: "Mar", date: "2026-03-31" },
        ],
      },
      fields: [
        { key: "activity_value", label: "kWh", required: true, column: "(month columns)", confidence: 1, source: "profile", skipped: false },
        { key: "activity_unit", label: "Unit", required: true, column: "Unit", confidence: 1, source: "profile", skipped: false },
      ],
      activities: [{ sheet_text: "Grid electricity", category_id: 3, factor_name: "Grid electricity", confidence: 1, source: "profile", save_mapping: false }],
      not_in_context: [],
      confidence: 1,
      source: "profile",
      excluded: false,
    },
  ],
};

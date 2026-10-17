import { describe, expect, it } from "vitest";
import { checkRowBodies, checkRowBody, serverIssueOf } from "./liveChecks";
import type { EmissionPayload } from "./entry";

const payload: EmissionPayload = {
  site_id: 4,
  category_id: 9,
  activity_data: { fuel_type: "diesel", quantity: "160", emission_category: "Diesel" },
  extra_data: { po: "1" },
  total_emission: 0.43,
  unit: "tCO2e",
  date_of_reporting: "2025-09-30",
  activity_data_unit: "litre",
  reporting_period: "monthly",
};

describe("live checks (S3-15)", () => {
  it("sends the save's payload without the preview total, by row ref, with evidence and the edited row", () => {
    expect(checkRowBody({ rowId: 3, payload, editOf: 55, hasEvidence: true })).toEqual({
      ref: "3",
      id: 55,
      site_id: 4,
      category_id: 9,
      activity_data: { fuel_type: "diesel", quantity: "160", emission_category: "Diesel" },
      activity_data_unit: "litre",
      date_of_reporting: "2025-09-30",
      reporting_period: "monthly",
      year_type: null,
      method: null,
      has_evidence: true,
    });
    expect(checkRowBody({ rowId: 4, payload: { ...payload, method: "spend_based" }, editOf: null, hasEvidence: false })).toMatchObject({ method: "spend_based", has_evidence: false });
    expect(checkRowBody({ rowId: 4, payload, editOf: null, hasEvidence: false })).not.toHaveProperty("id");
    // An edit with no new files leaves has_evidence out, so the saved row's evidence counts.
    expect(checkRowBody({ rowId: 5, payload, editOf: 55, hasEvidence: false })).not.toHaveProperty("has_evidence");
  });

  it("checks at most 50 rows", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ rowId: i, payload, editOf: null, hasEvidence: false }));
    expect(checkRowBodies(many)).toHaveLength(50);
  });

  it("shows a server problem as the row's field error, in plain words for a User", () => {
    const res = (issue: object) => ({ ref: "1", checks: { ready: false, held: [] }, issue }) as never;
    expect(serverIssueOf(res({ code: "UNIT_NOT_CONVERTIBLE", message: "Unit mismatch - kg is not per litre", field: "activity_data_unit" }), false)).toEqual({
      field: "activity_data_unit",
      message: "This unit can't be used here. Choose another unit.",
    });
    expect(serverIssueOf(res({ code: "NO_FACTOR_FOR_YEAR", message: "No emission factor for 2024" }), true)).toEqual({ field: "values", message: "No emission factor for 2024" });
    expect(serverIssueOf(res({ code: "FIELD_REQUIRED", message: "Enter Quantity", field: "activity_data.quantity" }), false)).toEqual({ field: "values", message: "Enter Quantity" });
    expect(serverIssueOf({ ref: "1", checks: { ready: true, held: [] } }, false)).toBeNull();
    expect(serverIssueOf(undefined, false)).toBeNull();
  });
});

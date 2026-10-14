import { describe, expect, it } from "vitest";
import type { EmissionData } from "../../services/emissionService";
import {
  BATCH_SOURCE_OPTIONS,
  batchSource,
  parseBatchSource,
  type ColumnConfig,
  activityFields,
  activitySummary,
  effectiveStatus,
  factorValue,
  formatFactorValue,
  humanize,
  listParams,
  approveBatchCopy,
  attentionOf,
  batchApproveError,
  attentionOn,
  importProvenance,
  matchedByText,
  reviewRowsPath,
  mergeFera,
  optionLabel,
  periodQuery,
  quantityOf,
  reportOptions,
  rowPeriodLabel,
  scopeNumber,
} from "./logic";

function row(over: Partial<EmissionData> = {}): EmissionData {
  return {
    pk_id: 1,
    activity_data: {},
    total_emission: 1.5,
    unit: "tCO2e",
    date_of_reporting: "2025-09-30",
    status: "pending",
    created_at: "2025-10-02T08:00:00Z",
    updated_at: "2025-10-02T08:00:00Z",
    site: { site_id: 1, name: "Hidd" },
    category: { category_id: 10, category_name: "Diesel", scope: "Scope 1" },
    ...over,
  };
}

const fuelConfig: ColumnConfig = {
  columns: [
    { pk_id: 5, column_name: "fuel_type", column_type: "select" },
    { pk_id: 6, column_name: "grade", column_type: "select" },
    { pk_id: 7, column_name: "quantity", column_type: "number" },
  ],
  column_options: { "5": [{ id: 1, label: "Diesel" }, { id: 2, label: "Petrol" }] },
  column_dependencies: { grade: "fuel_type" },
  dependent_options: { grade: { Diesel: [{ id: 11, label: "Ultra low sulphur" }], Petrol: [{ id: 11, label: "95 RON" }] } },
};

describe("listParams", () => {
  const base = { siteIds: [1, 2], categoryIds: [] as number[], period: null, search: "", status: null, sort: null, page: 0, pageSize: 50 };

  it("always asks for pending on the approvals tab, oldest first is passed through", () => {
    const p = listParams({ ...base, tab: "approvals", status: "approved", sort: { id: "submitted", dir: "asc" } });
    expect(p).toMatchObject({ status: "pending", sort: "created_at", order: "asc", page: 1, limit: 50, siteIds: [1, 2] });
  });

  it("maps ledger sort, search and period", () => {
    const p = listParams({ ...base, tab: "ledger", status: "rejected", search: "  boiler ", sort: { id: "tco2e", dir: "desc" }, period: { kind: "month", year: 2025, month: 9 }, page: 2 });
    expect(p).toMatchObject({ status: "rejected", search: "boiler", sort: "total_emission", order: "desc", year: 2025, month: 9, page: 3 });
  });

  it("passes one upload batch through, and nothing when there is none", () => {
    expect(listParams({ ...base, tab: "approvals", batchId: "b-2" })).toMatchObject({ batchId: "b-2", status: "pending" });
    expect(listParams({ ...base, tab: "ledger" })).toMatchObject({ batchId: null });
  });

  it("asks for the rows that need attention only with a batch (XI5)", () => {
    expect(listParams({ ...base, tab: "approvals", batchId: "b-2", attention: true })).toMatchObject({ batchId: "b-2", attention: true });
    expect(listParams({ ...base, tab: "approvals", batchId: "b-2" })).toMatchObject({ attention: null });
    expect(listParams({ ...base, tab: "approvals", attention: true })).toMatchObject({ batchId: null, attention: null });
  });

  it("drops sorts the server can't do", () => {
    expect(listParams({ ...base, tab: "ledger", sort: { id: "activity", dir: "asc" } })).toMatchObject({ sort: null, order: null });
  });
});

describe("periodQuery", () => {
  it("handles month, calendar year and any period", () => {
    expect(periodQuery({ kind: "month", year: 2025, month: 3 })).toEqual({ year: 2025, month: 3 });
    expect(periodQuery({ kind: "cy", year: 2024 })).toEqual({ year: 2024, month: null });
    expect(periodQuery(null)).toEqual({ year: null, month: null });
  });
});

describe("mergeFera", () => {
  const parent = row({ pk_id: 1, fera_linked_id: 2 });
  const fera = row({ pk_id: 2, category: { category_id: 99, category_name: "FERA" }, total_emission: 0.2, fera_linked_id: 1 });
  const other = row({ pk_id: 3 });

  it("hides FERA rows and hangs them on their parent", () => {
    const m = mergeFera([parent, fera, other], false);
    expect(m.rows.map((r) => r.pk_id)).toEqual([1, 3]);
    expect(m.feraOf.get(1)?.pk_id).toBe(2);
    expect(m.feraOf.has(3)).toBe(false);
  });

  it("keeps FERA rows when looking at the FERA category", () => {
    expect(mergeFera([parent, fera], true).rows).toHaveLength(2);
  });

  it("shows a FERA entry once when FERA and its parent's category are both chosen", () => {
    const m = mergeFera([parent, fera, other], true);
    expect(m.rows.map((r) => r.pk_id)).toEqual([1, 2, 3]);
    expect(m.feraOf.size).toBe(0);
  });

  it("keeps a FERA row whose parent isn't in the list when the parent isn't pending", () => {
    const lone = { ...fera, fera_partner_status: "approved" as const };
    expect(mergeFera([lone, other], false).rows.map((r) => r.pk_id)).toEqual([2, 3]);
    const orphan = { ...fera, fera_partner_status: null };
    expect(mergeFera([orphan, other], false).rows.map((r) => r.pk_id)).toEqual([2, 3]);
  });

  it("hides a pending FERA row whose pending parent is on another page", () => {
    const elsewhere = { ...fera, fera_partner_status: "pending" as const };
    expect(mergeFera([elsewhere, other], false).rows.map((r) => r.pk_id)).toEqual([3]);
    // An API that doesn't report the partner: hide it as before.
    expect(mergeFera([fera, other], false).rows.map((r) => r.pk_id)).toEqual([3]);
  });

  it("keeps a decided FERA row whose parent isn't in the list", () => {
    const approvedFera = { ...fera, status: "approved" as const };
    expect(mergeFera([approvedFera, other], false).rows.map((r) => r.pk_id)).toEqual([2, 3]);
  });

  it("keeps a pending FERA row of an approved parent as its own row", () => {
    const approved = row({ pk_id: 1, fera_linked_id: 2, status: "approved" });
    const m = mergeFera([approved, fera], false);
    expect(m.rows.map((r) => r.pk_id)).toEqual([1, 2]);
    expect(m.feraOf.has(1)).toBe(false);
  });
});

describe("optionLabel", () => {
  it("resolves ids through the column's options", () => {
    expect(optionLabel(fuelConfig, "fuel_type", "1", {})).toBe("Diesel");
  });

  it("resolves dependent ids under the parent's label", () => {
    expect(optionLabel(fuelConfig, "grade", "11", { fuel_type: "2" })).toBe("95 RON");
    expect(optionLabel(fuelConfig, "grade", "11", { fuel_type: "1" })).toBe("Ultra low sulphur");
  });

  it("falls back to any dependent list, then the raw value", () => {
    expect(optionLabel(fuelConfig, "grade", "11", {})).toBe("Ultra low sulphur");
    expect(optionLabel(fuelConfig, "fuel_type", "Kerosene", {})).toBe("Kerosene");
    expect(optionLabel(undefined, "fuel_type", "1", {})).toBe("1");
  });
});

describe("activityFields", () => {
  const r = row({
    activity_data: { quantity: "120.5", grade: "11", fuel_type: "1", category_name: "Diesel", note: "", extra_field: "Site B" },
    activity_data_unit: "litre",
  });

  it("orders by the form, resolves labels and skips bookkeeping and empty values", () => {
    const f = activityFields(r, fuelConfig);
    expect(f.map((x) => [x.label, x.value])).toEqual([
      ["Fuel type", "Diesel"],
      ["Grade", "Ultra low sulphur"],
      ["Quantity", "120.5"],
      ["Extra field", "Site B"],
    ]);
    expect(quantityOf(f)).toBe(120.5);
    expect(activitySummary(f)).toEqual({ text: "Diesel · Ultra low sulphur", more: 2 });
  });

  it("still lists raw values before the config has loaded", () => {
    const f = activityFields(r, undefined);
    expect(f.map((x) => x.value)).toContain("1");
    expect(quantityOf(f)).toBe(120.5);
  });
});

describe("rowPeriodLabel", () => {
  it("labels monthly and yearly rows", () => {
    expect(rowPeriodLabel(row())).toBe("Sep 2025");
    expect(rowPeriodLabel(row({ reporting_period: "yearly", year_type: "CY", date_of_reporting: "2024-12-31" }))).toBe("CY 2024");
    expect(rowPeriodLabel(row({ reporting_period: "yearly", year_type: "FY", date_of_reporting: "2025-03-31" }))).toBe("FY 2024-25");
  });
});

describe("small helpers", () => {
  it("prefers the optimistic status", () => {
    expect(effectiveStatus(row(), new Map([[1, "approved"]]))).toBe("approved");
    expect(effectiveStatus(row(), new Map())).toBe("pending");
  });

  it("reads scopes and humanizes keys", () => {
    expect(scopeNumber("Scope 2")).toBe(2);
    expect(scopeNumber(null)).toBeNull();
    expect(humanize("fuelType")).toBe("Fuel type");
  });
});

describe("reportOptions", () => {
  it("offers the month, its calendar year and its financial year", () => {
    expect(reportOptions({ kind: "month", year: 2025, month: 2 })).toEqual([
      { kind: "month", label: "Feb 2025 (month)", year: 2025, month: 2 },
      { kind: "year", label: "Calendar year 2025", year: 2025, yearType: "CY" },
      { kind: "year", label: "FY 2024-25", year: 2025, yearType: "FY" },
    ]);
    expect(reportOptions({ kind: "month", year: 2025, month: 9 })[2]).toMatchObject({ label: "FY 2025-26", year: 2026 });
  });

  it("offers the year for a calendar year and nothing for any period", () => {
    expect(reportOptions({ kind: "cy", year: 2024 })).toEqual([{ kind: "year", label: "Calendar year 2024", year: 2024, yearType: "CY" }]);
    expect(reportOptions(null)).toEqual([]);
  });
});

describe("batch source chip", () => {
  it("maps the contract channels, with Bulk upload for batches that predate channels", () => {
    expect(batchSource("mcp")).toBe("claude");
    expect(batchSource("bulk_upload")).toBe("bulk");
    expect(batchSource("api")).toBe("api");
    expect(batchSource(undefined)).toBe("bulk");
    expect(batchSource(null)).toBe("bulk");
  });
  it("offers Claude, Bulk upload and API and reads ?source=", () => {
    expect(BATCH_SOURCE_OPTIONS.map((o) => o.label)).toEqual(["Claude", "Bulk upload", "API"]);
    expect(parseBatchSource("claude")).toBe("claude");
    expect(parseBatchSource("everything")).toBeNull();
    expect(parseBatchSource(null)).toBeNull();
  });
});

describe("factorValue", () => {
  it("reads the factor whether the API sends it as text or a number", () => {
    expect(factorValue({ factor_value: "2.5600" })).toBe(2.56);
    expect(factorValue({ factor_value: 0.00268 })).toBe(0.00268);
    expect(factorValue({ factor_value: "0" })).toBe(0);
  });

  it("is null when there is no usable number", () => {
    expect(factorValue({ factor_value: "" })).toBeNull();
    expect(factorValue({ factor_value: null })).toBeNull();
    expect(factorValue({ factor_value: undefined })).toBeNull();
    expect(factorValue({ factor_value: "n/a" })).toBeNull();
    expect(factorValue({ factor_value: "  " })).toBeNull();
  });
});

describe("formatFactorValue", () => {
  it("shows the factor without padding and keeps tiny factors", () => {
    expect(formatFactorValue({ factor_value: "2.5600" })).toBe("2.56");
    expect(formatFactorValue({ factor_value: "0.002680" })).toBe("0.00268");
    expect(formatFactorValue({ factor_value: 0.00000042 })).toBe("0.00000042");
    expect(formatFactorValue({ factor_value: null })).toBe("—");
  });
});

describe("reviewRowsPath", () => {
  const batch = { upload_batch_id: "b-2", site_id: 1, category_id: 20, pending_count: 12 };
  it("opens the approvals queue on the batch's site and category, any period, while rows are pending", () => {
    expect(reviewRowsPath(batch)).toBe("/data/approvals?period=all&site=1&category=20&batch=b-2");
  });
  it("opens the ledger once nothing is pending", () => {
    expect(reviewRowsPath({ ...batch, pending_count: 0 })).toBe("/data/ledger?period=all&site=1&category=20&batch=b-2");
  });
});

describe("needs attention (XI5)", () => {
  it("is on by default while the batch has such rows, and ?attention= overrides", () => {
    expect(attentionOn(null, 3)).toBe(true);
    expect(attentionOn(null, 0)).toBe(false);
    expect(attentionOn(null, undefined)).toBe(false);
    expect(attentionOn("0", 3)).toBe(false);
    expect(attentionOn("1", 0)).toBe(true);
  });

  it("reads the sheet reference and the match off the import row", () => {
    expect(importProvenance({ extra_data: {} })).toBeNull();
    expect(importProvenance({ extra_data: { import: { channel: "bulk_upload", row_ref: "Fuel!A5" } } })).toEqual({ row_ref: "Fuel!A5", meta: null });
    const p = importProvenance({ extra_data: { import: { channel: "bulk_upload", row_ref: "Fuel!A6", meta: { source: "llm", confidence: 0.64 } } } });
    expect(p).toEqual({ row_ref: "Fuel!A6", meta: { source: "llm", confidence: 0.64 } });
    expect(matchedByText(p!.meta!)).toBe("suggested (64 %)");
    expect(matchedByText({ source: "profile", confidence: 1 })).toBe("remembered from an earlier upload");
    expect(matchedByText({ source: "rules", confidence: 1 })).toBe("matched by name");
    expect(importProvenance({ extra_data: { import: { meta: { source: "magic", confidence: 0.5 } } } })).toBeNull();
  });

  it("names the attention count in the batch approval dialog", () => {
    expect(approveBatchCopy(300, 12)).toEqual({
      title: "Approve all 300 pending rows?",
      description: "12 of 300 pending rows were matched by the smart import below 80 % or changed before the import. Review them first, or approve everything now.",
      reviewFirst: true,
    });
    expect(approveBatchCopy(5, 0)).toMatchObject({ title: "Approve 5 pending rows?", reviewFirst: false });
    expect(approveBatchCopy(5, undefined).reviewFirst).toBe(false);
    expect(approveBatchCopy(12000, 1)).toEqual({
      title: "Approve all 12,000 pending rows?",
      description: "1 of 12,000 pending rows was matched by the smart import below 80 % or changed before the import. Review them first, or approve everything now.",
      reviewFirst: true,
    });
    expect(approveBatchCopy(1, 0).title).toBe("Approve 1 pending row?");
    expect(approveBatchCopy(1, 1).title).toBe("Approve the 1 pending row?");
  });

  it("explains a refused batch approve by the uploader", () => {
    expect(batchApproveError({ response: { status: 403, data: { message: "You can't approve or reject your own entries" } } })).toMatch(/Someone else must approve/);
    expect(batchApproveError({ response: { status: 500 } })).toBeNull();
    expect(batchApproveError(new Error("x"))).toBeNull();
  });

  it("reads the attention count under either summary name", () => {
    expect(attentionOf({ attention: 3 })).toBe(3);
    expect(attentionOf({ attention_count: 2 })).toBe(2);
    expect(attentionOf({ attention: 0, attention_count: 5 })).toBe(0);
    expect(attentionOf({})).toBeNull();
    expect(attentionOf(undefined)).toBeNull();
  });

  it("links Review rows with the attention filter on", () => {
    const batch = { upload_batch_id: "b-2", site_id: 1, category_id: 20, pending_count: 2 };
    expect(reviewRowsPath(batch, true)).toContain("attention=1");
    expect(reviewRowsPath(batch)).not.toContain("attention");
  });
});

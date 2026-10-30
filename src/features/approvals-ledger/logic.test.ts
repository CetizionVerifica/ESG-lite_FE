import { describe, expect, it } from "vitest";
import type { EmissionData } from "../../services/emissionService";
import {
  duplicateApproveCopy,
  possibleDuplicates,
  foldedTwinNote,
  isFoldedFeraTwin,
  BATCH_SOURCE_OPTIONS,
  batchSource,
  parseBatchSource,
  type ColumnConfig,
  activityFields,
  activitySummary,
  drawerRow,
  effectiveStatus,
  factorValue,
  formatFactorValue,
  humanize,
  listParams,
  type ListInput,
  approveAllCopy,
  historyMonths,
  monthlyHistory,
  reviewCounts,
  rowMonth,
  skippedCopy,
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
  rowQuantity,
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

  it("passes the S3-3 method and data quality filters (method=, dq_max=)", () => {
    expect(listParams({ ...base, tab: "ledger", method: "spend_based", dqMax: 2 })).toMatchObject({ method: "spend_based", dqMax: 2 });
    expect(listParams({ ...base, tab: "approvals" })).toMatchObject({ method: null, dqMax: null });
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
    expect(m.feraOf.get(1)?.map((f) => f.pk_id)).toEqual([2]);
    expect(m.feraOf.has(3)).toBe(false);
  });

  it("hangs both twins of a Scope 2 row on it: upstream and T&D losses (S3-7)", () => {
    const upstream = { ...fera, scope3_sub: "3b_upstream_electricity" };
    const td = row({ pk_id: 4, category: { category_id: 99, category_name: "FERA" }, total_emission: 0.1, fera_linked_id: 1, scope3_sub: "3c_td_losses" });
    const m = mergeFera([parent, td, upstream, other], false);
    expect(m.rows.map((r) => r.pk_id)).toEqual([1, 3]);
    expect(m.feraOf.get(1)?.map((f) => f.scope3_sub)).toEqual(["3b_upstream_electricity", "3c_td_losses"]);
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

  it("counts a pending FERA twin as folded only while its partner is pending", () => {
    expect(isFoldedFeraTwin({ ...fera, fera_partner_status: "pending" as const })).toBe(true);
    expect(isFoldedFeraTwin(fera)).toBe(true);
    expect(isFoldedFeraTwin({ ...fera, fera_partner_status: "approved" as const })).toBe(false);
    expect(isFoldedFeraTwin({ ...fera, fera_partner_status: null })).toBe(false);
    expect(isFoldedFeraTwin({ ...fera, status: "approved" as const })).toBe(false);
    expect(isFoldedFeraTwin(parent)).toBe(false);
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

describe("rowQuantity", () => {
  const fields = [{ key: "Distance travelled", label: "Distance travelled", value: "500", numeric: true }];
  it("prefers the server's quantity (a Smart transport row's tonne.km, not its first number field)", () => {
    expect(rowQuantity({ quantity: 1000 }, fields)).toBe(1000);
  });
  it("falls back to the first numeric field when the server sends none", () => {
    expect(rowQuantity({}, fields)).toBe(500);
    expect(rowQuantity({ quantity: null }, fields)).toBe(500);
    expect(rowQuantity({ quantity: null }, [])).toBeNull();
  });
});

describe("activityFields", () => {
  const r = row({
    activity_data: { quantity: "120.5", grade: "11", fuel_type: "1", category_name: "Diesel", note: "", extra_field: "Site B" },
    activity_data_unit: "litre",
  });

  it("leaves the row's method out: it has its own line (S3-3)", () => {
    const withMethod = row({ activity_data: { quantity: "40", "@method": "distance_based" } });
    expect(activityFields(withMethod, undefined).map((x) => x.key)).toEqual(["quantity"]);
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
    expect(batchApproveError({ response: { status: 403, data: { message: "You can't approve or reject your own entries" } } })).toBe("You can't approve this batch yourself. Ask another manager to approve it.");
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

describe("review queue (S3-15)", () => {
  const base: ListInput = { tab: "approvals", siteIds: [1], categoryIds: [], period: null, search: "", status: null, sort: null, page: 0, pageSize: 50 };

  it("sends ready=1/0 for ?group= on Approvals only, never with a batch", () => {
    expect(listParams({ ...base, group: "ready" }).ready).toBe(true);
    expect(listParams({ ...base, group: "attention" }).ready).toBe(false);
    expect(listParams({ ...base, group: null }).ready).toBeNull();
    expect(listParams({ ...base, group: "ready", batchId: "b-1" }).ready).toBeNull();
    expect(listParams({ ...base, tab: "ledger", group: "ready" }).ready).toBeNull();
  });

  it("reads Ready and Needs attention from summary.ready and summary.held", () => {
    expect(reviewCounts({ ready: 10, held: 4 })).toEqual({ ready: 10, attention: 4 });
    expect(reviewCounts({ ready: 0 })).toEqual({ ready: 0, attention: 0 });
    // An API without checks.
    expect(reviewCounts({} as { ready?: unknown })).toBeNull();
    expect(reviewCounts(null)).toBeNull();
  });

  it("words the bulk approve and the skipped rows", () => {
    expect(approveAllCopy(1200)).toEqual({ button: "Approve all 1,200 ready", toast: "1,200 ready entries approved" });
    expect(approveAllCopy(1).toast).toBe("1 ready entry approved");
    expect(approveAllCopy(1200, 5000).button).toBe("Approve all 1,200 ready");
    expect(approveAllCopy(6200, 5000)).toEqual({ button: "Approve 5,000 of 6,200 ready", toast: "5,000 ready entries approved" });
    expect(skippedCopy(0)).toBeNull();
    expect(skippedCopy(1)).toMatch(/^1 entry wasn't approved/);
    expect(skippedCopy(3)).toMatch(/^3 entries weren't approved/);
  });

  it("lists the six months up to the entry's month, across a year end", () => {
    expect(historyMonths({ year: 2026, month: 2 })).toEqual([
      { year: 2025, month: 9 },
      { year: 2025, month: 10 },
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
    expect(rowMonth({ date_of_reporting: "2026-02-28", reporting_period: "monthly" })).toEqual({ year: 2026, month: 2 });
    expect(rowMonth({ date_of_reporting: "2026-03-31", reporting_period: "yearly" })).toBeNull();
  });

  it("sums the same site, category and activity per month, without rejected or yearly rows", () => {
    const mk = (id: number, date: string, total: number, extra: Partial<EmissionData> = {}) =>
      ({
        pk_id: id,
        status: "approved",
        date_of_reporting: date,
        total_emission: total,
        activity_data: { emission_category: "Diesel" },
        site: { site_id: 1, name: "Hidd" },
        category: { category_id: 10, category_name: "Fuel" },
        ...extra,
      }) as EmissionData;
    const row = mk(1, "2026-09-30", 5, { status: "pending" });
    const history = monthlyHistory(row, [
      row,
      mk(2, "2026-08-31", 4),
      mk(3, "2026-08-15", 1),
      mk(4, "2026-07-31", 9, { status: "rejected" }),
      mk(5, "2026-06-30", 2, { activity_data: { emission_category: "Petrol" } }),
      mk(6, "2026-05-31", 2, { site: { site_id: 2, name: "Other" } }),
      mk(7, "2026-12-31", 30, { reporting_period: "yearly" }),
      mk(8, "2026-03-31", 7),
    ]);
    expect(history.map((m) => [m.label, m.total, m.entries])).toEqual([
      ["Apr 2026", 0, 0],
      ["May 2026", 0, 0],
      ["Jun 2026", 0, 0],
      ["Jul 2026", 0, 0],
      ["Aug 2026", 5, 2],
      ["Sep 2026", 5, 1],
    ]);
    expect(history[history.length - 1].current).toBe(true);
  });
});

describe("foldedTwinNote (F-26)", () => {
  it("says how many listed rows are Category 3 twins riding on their entry", () => {
    expect(foldedTwinNote({ pending_count: 159, pending_review_count: 147 }, 159, false)).toBe("159 rows, 12 of them Category 3 rows shown with their entries.");
    expect(foldedTwinNote({ pending_count: 2, pending_review_count: 1 }, 2, false)).toBe("2 rows, 1 of them Category 3 row shown with its entry.");
  });

  it("says nothing without twins, with FERA rows shown on their own, or without the counts", () => {
    expect(foldedTwinNote({ pending_count: 5, pending_review_count: 5 }, 5, false)).toBeNull();
    expect(foldedTwinNote({ pending_count: 159, pending_review_count: 147 }, 159, true)).toBeNull();
    expect(foldedTwinNote({ pending_count: 159 }, 159, false)).toBeNull();
    expect(foldedTwinNote(undefined, 0, false)).toBeNull();
  });
});

describe("approving a possible duplicate", () => {
  const row = (id: number, held: string[], status = "pending") => ({ pk_id: id, status, checks: { ready: held.length === 0, held } });

  it("finds the pending rows held as a possible duplicate", () => {
    const rows = [row(1, ["NO_DUPLICATE"]), row(2, ["EVIDENCE_ATTACHED"]), row(3, ["EVIDENCE_ATTACHED", "NO_DUPLICATE"]), row(4, ["NO_DUPLICATE"], "approved"), row(5, [])];
    expect(possibleDuplicates(rows).map((r) => r.pk_id)).toEqual([1, 3]);
    expect(possibleDuplicates([{ pk_id: 6, status: "pending" }])).toEqual([]);
  });

  it("asks in plain words, naming how many of the selection", () => {
    expect(duplicateApproveCopy(1, 1).title).toBe("Approve a possible duplicate?");
    expect(duplicateApproveCopy(1, 1).description).toMatch(/^This entry looks like a duplicate: another entry has the same site/);
    expect(duplicateApproveCopy(2, 5).title).toBe("Approve 2 possible duplicates?");
    expect(duplicateApproveCopy(2, 5).description).toMatch(/^2 of these entries look like duplicates \(2 of the 5 you're approving\)/);
    expect(duplicateApproveCopy(2, 5).confirm).toBe("Approve anyway");
  });
});

describe("drawerRow", () => {
  const listed = [row({ pk_id: 1, total_emission: 1.5 }), row({ pk_id: 2 })];

  it("shows the listed row, so a refetch shows the record as it is now", () => {
    expect(drawerRow(row({ pk_id: 1, total_emission: 9 }), listed)).toBe(listed[0]);
  });

  it("keeps a just-saved row until the list catches up, so a second edit starts from the saved version", () => {
    const saved = row({ pk_id: 1, total_emission: 2, updated_at: "2025-10-02T09:00:00Z" });
    expect(drawerRow(saved, listed)).toBe(saved);
    expect(drawerRow(saved, [row({ pk_id: 1, updated_at: "2025-10-02T09:00:00Z" })])?.updated_at).toBe("2025-10-02T09:00:00Z");
  });

  it("keeps the held row when it isn't listed, and nothing when no record is open", () => {
    const held = row({ pk_id: 3 });
    expect(drawerRow(held, listed)).toBe(held);
    expect(drawerRow(held, undefined)).toBe(held);
    expect(drawerRow(null, listed)).toBeNull();
  });
});

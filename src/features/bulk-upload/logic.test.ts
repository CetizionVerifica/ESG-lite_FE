import { describe, expect, it } from "vitest";
import type { ColumnConfig, ColumnEntity } from "../../lib/emissions";
import {
  DATE_KEY,
  autoMap,
  buildFields,
  contributorSites,
  fileProblem,
  findCategoryColumn,
  findValueColumn,
  mappingsFor,
  matchChip,
  monthEndDate,
  previewCounts,
  rowIssue,
  setHeader,
  skippedMatrix,
  templateHeaders,
  toggleSkip,
  unmapped,
} from "./logic";
import { historicalFileProblem, historicalSkippedMatrix, monthLabel } from "./historical";
import type { HistoricalResult } from "./api";

const col = (pk_id: number, column_name: string, column_type = "text"): ColumnEntity => ({ pk_id, column_name, column_type });

const fuel: ColumnConfig = {
  pk_id: 1,
  config_name: "Fuel",
  columns: [col(1, "Fuel Category"), col(2, "Quantity", "number"), col(3, "Supplier")],
  extra_fields: [{ key: "po", label: "PO number", type: "text", required: false }],
};

describe("column detection", () => {
  it("prefers an exact emission category column over a loose match", () => {
    expect(findCategoryColumn([col(1, "Fuel Category"), col(2, "emission_category")])?.column_name).toBe("emission_category");
    expect(findCategoryColumn([col(1, "Fuel Category")])?.column_name).toBe("Fuel Category");
    expect(findCategoryColumn([col(1, "Fuel Category"), col(2, "Waste category")])).toBeNull();
  });

  it("finds the value column only when exactly one is numeric", () => {
    expect(findValueColumn(fuel.columns)?.column_name).toBe("Quantity");
    expect(findValueColumn([col(1, "a", "number"), col(2, "b", "number")])).toBeNull();
  });
});

describe("buildFields", () => {
  it("promotes the category and value columns and ends with unit, extras and date", () => {
    const fields = buildFields(fuel);
    expect(fields.map((f) => f.key)).toEqual(["emission_category", "activity_value", "Supplier", "activity_data_unit", "extra_po", DATE_KEY]);
    expect(fields[0]).toMatchObject({ label: "Fuel Category", sourceColumn: "Fuel Category", required: true });
    expect(fields.find((f) => f.key === DATE_KEY)?.required).toBe(false);
  });

  it("has no single value field for a calculation spec", () => {
    const fields = buildFields({ ...fuel, calculation: { methods: {} } as unknown as ColumnConfig["calculation"] });
    expect(fields.some((f) => f.key === "activity_value")).toBe(false);
    expect(fields.some((f) => f.key === "Quantity")).toBe(true);
  });
});

describe("mapping", () => {
  const headers = ["fuel_category", "QUANTITY", "Supplier", "Activity unit", "po", "Reporting date"];

  it("matches headers by name, ignoring case and separators, without reusing a header", () => {
    const fields = autoMap(buildFields(fuel), headers);
    expect(Object.fromEntries(fields.map((f) => [f.key, f.header]))).toEqual({
      emission_category: "fuel_category",
      activity_value: "QUANTITY",
      Supplier: "Supplier",
      activity_data_unit: "Activity unit",
      extra_po: "po",
      [DATE_KEY]: "Reporting date",
    });
    expect(fields.every((f) => matchChip(f) === "matched")).toBe(true);
    expect(unmapped(fields)).toEqual([]);
  });

  it("marks unmatched required fields Check and lets optional ones be skipped", () => {
    let fields = autoMap(buildFields(fuel), ["fuel_category"]);
    expect(matchChip(fields.find((f) => f.key === "activity_value")!)).toBe("check");
    expect(unmapped(fields).map((f) => f.key)).toEqual(["activity_value", "Supplier", "activity_data_unit"]);

    fields = toggleSkip(fields, "Supplier");
    expect(matchChip(fields.find((f) => f.key === "Supplier")!)).toBe("skipped");
    // Category and unit drive the factor lookup and can't be skipped.
    expect(toggleSkip(fields, "activity_data_unit")).toEqual(fields);

    fields = setHeader(fields, "activity_value", "QUANTITY");
    expect(fields.find((f) => f.key === "activity_value")).toMatchObject({ header: "QUANTITY", auto: false });
    expect(matchChip(fields.find((f) => f.key === "activity_value")!)).toBeNull();
  });

  it("sends promoted columns under the fixed key and the site's column name, and the date as date_of_reporting", () => {
    const fields = toggleSkip(autoMap(buildFields(fuel), headers), "extra_po");
    expect(mappingsFor(fields)).toEqual({
      emission_category: "fuel_category",
      "Fuel Category": "fuel_category",
      activity_value: "QUANTITY",
      Quantity: "QUANTITY",
      Supplier: "Supplier",
      activity_data_unit: "Activity unit",
      date_of_reporting: "Reporting date",
    });
  });

  it("builds a template whose headers map themselves", () => {
    const template = templateHeaders(buildFields(fuel));
    expect(template).toEqual(["Fuel Category", "Quantity", "Supplier", "Activity unit", "PO number", "Reporting date"]);
    expect(unmapped(autoMap(buildFields(fuel), template))).toEqual([]);
  });
});

describe("preview issues", () => {
  const ok = { emission_category: "Diesel", global_category_name: "Diesel", total_emission: 1.2 };

  it("flags skipped, unmatched and zero rows", () => {
    expect(rowIssue(ok)).toBeNull();
    expect(rowIssue({ ...ok, row_error: "Missing Units sold" })?.kind).toBe("skip");
    expect(rowIssue({ ...ok, global_category_name: null })?.kind).toBe("no-factor");
    expect(rowIssue({ ...ok, total_emission: 0 })?.kind).toBe("zero");
    expect(previewCounts([ok, { ...ok, total_emission: 0 }])).toEqual({ valid: 1, issues: 1 });
  });
});

describe("skippedMatrix", () => {
  it("uses the service's skipped rows when it lists them", () => {
    const out = skippedMatrix({ inserted: 2, skipped: 2, total_rows: 4, skipped_rows: [{ row: 3, emission_category: "Mars Grid", reason: "No factor" }] }, []);
    expect(out).toEqual({ matrix: [["Row", "Emission category", "Reason"], ["3", "Mars Grid", "No factor"]], partial: true });
  });

  it("falls back to preview rows with an error, and is null with nothing skipped", () => {
    const preview = [{ emission_category: "A" }, { emission_category: "B", row_error: "Missing field" }];
    expect(skippedMatrix({ inserted: 1, skipped: 1, total_rows: 2 }, preview)?.matrix[1]).toEqual(["", "B", "Missing field"]);
    expect(skippedMatrix({ inserted: 2, skipped: 0, total_rows: 2 }, preview)).toBeNull();
  });
});

describe("files and dates", () => {
  it("files rows without a date on the month's last day", () => {
    expect(monthEndDate("2026-02")).toBe("2026-02-28");
    expect(monthEndDate("2024-02")).toBe("2024-02-29");
    expect(monthEndDate("2026-12")).toBe("2026-12-31");
  });

  it("rejects other file types and files over 100 MB", () => {
    expect(fileProblem(new File(["a"], "rows.xlsx"))).toBeNull();
    expect(fileProblem(new File(["a"], "rows.pdf"))).toMatch(/xlsx/);
    const big = new File(["a"], "rows.csv");
    Object.defineProperty(big, "size", { value: 101 * 1024 * 1024 });
    expect(fileProblem(big)).toMatch(/100 MB/);
  });
});

describe("contributorSites", () => {
  it("reads user.sites, falls back to user.site, and leaves FERA out", () => {
    const cats = [
      { category_id: 1, category_name: "Fuel" },
      { category_id: 5, category_name: "FERA" },
    ];
    const sites = contributorSites({ sites: [{ site_id: 2, name: "Hidd", company: { company_id: 1, name: "Midal" }, categories: cats }] });
    expect(sites).toEqual([{ site_id: 2, name: "Hidd", company: { company_id: 1, name: "Midal" }, categories: [cats[0]] }]);
    expect(contributorSites({ site: { site_id: 3, name: "Pune" } })).toEqual([{ site_id: 3, name: "Pune", company: null, categories: [] }]);
    expect(contributorSites(null)).toEqual([]);
  });
});

describe("historical import", () => {
  it("labels months, checks files and lists skipped rows", () => {
    expect(monthLabel("2019-01")).toBe("Jan 2019");
    expect(monthLabel(null)).toBe("");
    expect(historicalFileProblem(new File(["a"], "old.xls"))).toBeNull();
    expect(historicalFileProblem(new File(["a"], "old.csv"))).toMatch(/xlsx/);
    const result = {
      dryRun: false as const,
      summary: {} as HistoricalResult["summary"],
      skippedRows: [{ row: 3, period: null, reason: "Year or month is missing or not recognised." }],
    };
    expect(historicalSkippedMatrix(result)).toEqual([["Row", "Month", "Reason"], ["3", "", "Year or month is missing or not recognised."]]);
    expect(historicalSkippedMatrix({ ...result, skippedRows: [] })).toBeNull();
  });
});

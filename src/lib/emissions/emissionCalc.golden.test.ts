/**
 * Golden snapshots of the Add data emission calculation.
 *
 * These pin what the legacy page (pages/UserDataEntry) computes TODAY for a
 * set of site × category contexts, so moving the logic can be proven to
 * change nothing: the snapshot file was written against the old hook before
 * the move and must stay byte-identical. A deliberate calculation change
 * updates it with `npx vitest run -u` and lists the moved figures in the PR.
 */
import { describe, expect, it } from "vitest";
import { createEmissionCalculator } from "./emissionCalc";
import { factorYearForDate, yearlyPeriodEndDate } from "./reportingPeriod";
import type { CalculationSpec, ColumnEntity, EmissionCategoryMapping, EmissionFactor, ModalRow } from "./types";

// ---------------------------------------------------------------------------
// Period → factor year (reportingPeriod.ts): yearly mode stores the
// period-end date and the factor year is the reporting year minus one.
// ---------------------------------------------------------------------------
type Period =
  | { mode: "monthly"; date: string }
  | { mode: "yearly"; yearType: "CY" | "FY"; year: number };

const periodDate = (p: Period): string => (p.mode === "monthly" ? p.date : yearlyPeriodEndDate(p.yearType, p.year));
const factorYear = (date: string): number => factorYearForDate(date) as number;

interface Options {
  factors: EmissionFactor[];
  targetYear?: number;
  columns?: ColumnEntity[];
  selectColumnNames?: string[];
  mapping?: EmissionCategoryMapping;
  fallbackToRaw?: boolean;
  spec?: CalculationSpec | null;
}

const makeCalc = (o: Options) =>
  createEmissionCalculator({
    emissionFactors: o.factors,
    targetYear: o.targetYear,
    columns: o.columns,
    selectColumnNames: o.selectColumnNames,
    fallbackToRaw: o.fallbackToRaw,
    calculationSpec: o.spec,
  });

const run = (o: Options, rows: ModalRow[]) => {
  const calc = makeCalc(o);
  return rows.map((row) => ({
    row,
    expectedUnit: row.emission_category ? calc.getExpectedUnit(row.emission_category) : null,
    factorId: row.emission_category ? calc.getEmissionFactor(row.emission_category)?.emission_factor_id ?? null : null,
    activity: calc.findActivityValue(row),
    result: calc.calculateEmission(row),
  }));
};

let nextId = 1;
const ef = (name: string, value: number, unit: string, year: number, global?: string): EmissionFactor => ({
  emission_factor_id: nextId++,
  emission_category_name: name,
  global_category_name: global,
  factor_value: value,
  denominator_unit: unit,
  year,
});
const col = (pk_id: number, column_name: string, column_type = "number"): ColumnEntity => ({ pk_id, column_name, column_type });

// ---------------------------------------------------------------------------
// Context 1 · Bahrain plant × Stationary combustion, monthly Sep 2025
// ---------------------------------------------------------------------------
const stationaryFactors = [
  ef("Diesel (avg biofuel blend)", 2680, "litre", 2024, "Diesel"),
  ef("Diesel (avg biofuel blend)", 2700, "litre", 2025, "Diesel"),
  ef("Natural gas", 0.18316, "kwh", 2024),
  ef("LPG", 1555, "litre", 2024),
  ef(" Fuel oil ", 3170, "tonne", 2024),
  ef("Coal [tonne]", 2400, "tonne", 2024),
];
const stationaryColumns = [col(1, "fuel_type", "select"), col(2, "quantity"), col(3, "notes", "text")];

describe("Context 1 · Bahrain × Stationary combustion · monthly 2025-09", () => {
  const targetYear = factorYear(periodDate({ mode: "monthly", date: "2025-09-30" }));
  it("factor year is the reporting year minus one", () => {
    expect(targetYear).toBe(2024);
  });
  it("matches the golden outputs", () => {
    expect(
      run(
        {
          factors: stationaryFactors,
          targetYear,
          columns: stationaryColumns,
          selectColumnNames: ["fuel_type"],
          mapping: { "Diesel": "Diesel (avg biofuel blend)", "Gas": "Natural gas", "Company LPG": "LPG" },
        },
        [
          { id: 1 }, // no category
          { id: 2, emission_category: "Diesel (avg biofuel blend)", fuel_type: "7", quantity: "1600", activity_data_unit: "litre" },
          { id: 3, emission_category: "Diesel (avg biofuel blend)", quantity: "1600", activity_data_unit: "Litre " },
          { id: 4, emission_category: "Diesel (avg biofuel blend)", quantity: "420", activity_data_unit: "gallon" },
          { id: 5, emission_category: "Diesel (avg biofuel blend)", quantity: "2.5", activity_data_unit: "kl" },
          { id: 6, emission_category: "Diesel (avg biofuel blend)", quantity: "100", activity_data_unit: "kg" },
          { id: 7, emission_category: "Diesel", quantity: "50", activity_data_unit: "litre" }, // global name
          { id: 8, emission_category: "Natural gas", quantity: "12000", activity_data_unit: "mwh" },
          { id: 9, emission_category: "Natural gas", quantity: "3", activity_data_unit: "MWh" },
          { id: 10, emission_category: "Natural gas", quantity: "12", activity_data_unit: "gj" },
          { id: 11, emission_category: "fuel oil", quantity: "1.234", activity_data_unit: "tonne" }, // normalized match
          { id: 12, emission_category: "Fuel oil", quantity: "800", activity_data_unit: "kg" },
          { id: 13, emission_category: "Petrol", quantity: "10", activity_data_unit: "litre" }, // no factor
          { id: 14, emission_category: "Diesel (avg biofuel blend)", quantity: "", activity_data_unit: "litre" },
          { id: 15, emission_category: "Diesel (avg biofuel blend)", quantity: "0", activity_data_unit: "litre" },
          { id: 16, emission_category: "Diesel (avg biofuel blend)", quantity: "-5", activity_data_unit: "litre" },
          { id: 17, emission_category: "Diesel (avg biofuel blend)", quantity: "1600" }, // no unit
          { id: 18, emission_category: "Coal [tonne]", quantity: "3", activity_data_unit: "km" }, // bracket mismatch
          { id: 19, emission_category: "   ", quantity: "3", activity_data_unit: "litre" },
          // Saved row: bookkeeping fields must never be read as the activity.
          { id: 20, pk_id: 991, emission_category: "LPG", date_of_reporting: "2025-09-30", site_id: 4, total_emission: 9.9, quantity: "75.5", activity_data_unit: "litre" },
          { id: 21, emission_category: "LPG", quantity__multiplier: "3", quantity__distance: "4", _ocrUnit: "5", quantity: "6", activity_data_unit: "litre" },
          { id: 22, emission_category: "LPG", quantity: "1,500", activity_data_unit: "litre" }, // comma: parseFloat reads 1
          { id: 23, emission_category: "LPG", quantity: "0.004", activity_data_unit: "litre" }, // rounds to 0.01
          { id: 24, emission_category: "LPG", quantity: "0.002", activity_data_unit: "litre" }, // rounds to 0
        ],
      ),
    ).toMatchSnapshot();
  });
  it("a factor named with the client's own category name is not used, as the backend never matches it", () => {
    const [out] = run(
      { factors: [ef("Company LPG", 1500, "litre", 2024)], targetYear, mapping: { "Company LPG": "LPG" } },
      [{ id: 1, emission_category: "LPG", quantity: "10", activity_data_unit: "litre" }],
    );
    expect(out.factorId).toBeNull();
  });
  it("without a target year every year's factor is a candidate (first one wins)", () => {
    expect(
      run({ factors: stationaryFactors }, [
        { id: 1, emission_category: "Diesel (avg biofuel blend)", quantity: "1000", activity_data_unit: "litre" },
      ]),
    ).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Context 2 · Bahrain plant × Use of Sold Products (per_method spec), CY 2025
// filed yearly → period end 2025-12-31 → factor year 2024
// ---------------------------------------------------------------------------
const soldSpec: CalculationSpec = {
  mode: "per_method",
  method_column: "method",
  identity_columns: ["method"],
  methods: {
    "Fuel consumed": { multiply: ["units_sold", "fuel_per_use", "lifetime_uses"], activity_unit: "litre" },
    "Electricity consumed": { multiply: ["units_sold", "kwh_per_use", "lifetime_uses", "share_used"], percent: ["share_used"], activity_unit: "kwh" },
    "Empty": { multiply: [] },
  },
};
const soldFactors = [ef("Diesel use", 2680, "litre", 2024), ef("Grid electricity", 0.5, "kwh", 2024), ef("Grid electricity", 0.6, "kwh", 2025)];

describe("Context 2 · Bahrain × Use of sold products · yearly CY 2025 (per_method)", () => {
  const date = periodDate({ mode: "yearly", yearType: "CY", year: 2025 });
  const targetYear = factorYear(date);
  it("period end and factor year", () => {
    expect({ date, targetYear }).toEqual({ date: "2025-12-31", targetYear: 2024 });
  });
  it("matches the golden outputs", () => {
    expect(
      run(
        { factors: soldFactors, targetYear, columns: [col(10, "method", "select")], selectColumnNames: ["method"], spec: soldSpec },
        [
          { id: 1, emission_category: "Diesel use", activity_data_unit: "litre" }, // method not chosen
          { id: 2, emission_category: "Diesel use", method: "Fuel consumed", units_sold: "1000", fuel_per_use: "0.5", lifetime_uses: "200", activity_data_unit: "litre" },
          { id: 3, emission_category: "Diesel use", method: "  Fuel consumed ", units_sold: "1,000", fuel_per_use: "0.5", lifetime_uses: "200", activity_data_unit: "litre" },
          { id: 4, emission_category: "Diesel use", method: "Fuel consumed", units_sold: "1000", fuel_per_use: "", lifetime_uses: "200", activity_data_unit: "litre" },
          { id: 5, emission_category: "Grid electricity", method: "Electricity consumed", units_sold: "500", kwh_per_use: "1.2", lifetime_uses: "1000", share_used: "40", activity_data_unit: "kwh" },
          { id: 6, emission_category: "Grid electricity", method: "Electricity consumed", units_sold: "500", kwh_per_use: "1.2", lifetime_uses: "1000", share_used: "140", activity_data_unit: "kwh" },
          { id: 7, emission_category: "Grid electricity", method: "Electricity consumed", units_sold: "500", kwh_per_use: "1.2", lifetime_uses: "1000", share_used: "40", activity_data_unit: "mwh" },
          { id: 8, emission_category: "Grid electricity", method: "Empty", units_sold: "1", activity_data_unit: "kwh" },
          { id: 9, emission_category: "Grid electricity", method: "Unknown", units_sold: "1", activity_data_unit: "kwh" },
          { id: 10, emission_category: "Diesel use", method: "Fuel consumed", units_sold: "1000", fuel_per_use: "0.5", lifetime_uses: "200" }, // no unit
        ],
      ),
    ).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Context 3 · Dubai warehouse × Upstream transport (per_unit spec + legacy
// field), FY site filed yearly: FY 2025-26 → period end 2026-03-31 → factor
// year 2025
// ---------------------------------------------------------------------------
const transportSpec: CalculationSpec = {
  mode: "per_unit",
  legacy_field: "quantity",
  methods: {
    "tonne.km": { multiply: ["weight", "distance"], activity_unit: "tonne.km" },
    km: { multiply: ["distance"], activity_unit: "km" },
  },
};
const transportFactors = [
  ef("HGV diesel [tonne.km]", 107, "tonne.km", 2025),
  ef("HGV diesel [km]", 900, "km", 2025),
  ef("HGV diesel [tonne.km]", 99, "tonne.km", 2024),
];

describe("Context 3 · Dubai × Upstream transport · yearly FY 2025-26 (per_unit)", () => {
  const date = periodDate({ mode: "yearly", yearType: "FY", year: 2025 });
  const targetYear = factorYear(date);
  it("period end and factor year", () => {
    expect({ date, targetYear }).toEqual({ date: "2026-03-31", targetYear: 2025 });
  });
  it("matches the golden outputs", () => {
    expect(
      run(
        { factors: transportFactors, targetYear, columns: [col(20, "mode", "select"), col(21, "weight"), col(22, "distance"), col(23, "quantity")], selectColumnNames: ["mode"], spec: transportSpec },
        [
          { id: 1, emission_category: "HGV diesel [tonne.km]" }, // no unit
          { id: 2, emission_category: "HGV diesel [tonne.km]", weight: "20", distance: "350", activity_data_unit: "tonne.km" },
          { id: 3, emission_category: "HGV diesel [tonne.km]", weight: "20", distance: "350", activity_data_unit: "Tonne KM" },
          { id: 4, emission_category: "HGV diesel [tonne.km]", weight: "20", distance: "350", activity_data_unit: "tkm" },
          { id: 5, emission_category: "HGV diesel [tonne.km]", weight: "20000", distance: "350", activity_data_unit: "kg.km" },
          { id: 6, emission_category: "HGV diesel [km]", distance: "350", activity_data_unit: "kms" },
          { id: 7, emission_category: "HGV diesel [km]", distance: "350", weight: "20", activity_data_unit: "km" },
          { id: 8, emission_category: "HGV diesel [tonne.km]", distance: "350", activity_data_unit: "km" }, // bracket mismatch
          { id: 9, emission_category: "HGV diesel [tonne.km]", weight: "20", distance: "350", activity_data_unit: "litre" }, // unit not in spec
          { id: 10, emission_category: "HGV diesel [tonne.km]", quantity: "7000", activity_data_unit: "tonne.km" }, // legacy row
          { id: 11, emission_category: "HGV diesel [tonne.km]", quantity: "0", activity_data_unit: "tonne.km" }, // legacy, invalid
          { id: 12, emission_category: "HGV diesel [tonne.km]", quantity: "7000", weight: "2", activity_data_unit: "tonne.km" }, // not legacy
          { id: 13, emission_category: "HGV diesel [km]", quantity: "500", activity_data_unit: "km" }, // km method has no legacy split
        ],
      ),
    ).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Context 4 · Bahrain plant × FERA, alongside Stationary combustion, monthly
// Sep 2025: FERA factors use fallbackToRaw (energy content is in the factor)
// ---------------------------------------------------------------------------
describe("Context 4 · Bahrain × FERA (fallbackToRaw) · monthly 2025-09", () => {
  const targetYear = factorYear(periodDate({ mode: "monthly", date: "2025-09-01" }));
  const feraFactors = [
    ef("Diesel (avg biofuel blend)", 610, "kwh", 2024), // WTT per kWh; row in litres has no conversion
    ef("Natural gas", 0.03, "kwh", 2024),
  ];
  it("matches the golden outputs", () => {
    expect(
      run(
        { factors: feraFactors, targetYear, columns: stationaryColumns, selectColumnNames: ["fuel_type"], fallbackToRaw: true },
        [
          { id: 1, emission_category: "Diesel (avg biofuel blend)", quantity: "1600", activity_data_unit: "litre" },
          { id: 2, emission_category: "Natural gas", quantity: "12", activity_data_unit: "mwh" },
          { id: 3, emission_category: "Natural gas", quantity: "12000", activity_data_unit: "kwh" },
          { id: 4, emission_category: "LPG", quantity: "5", activity_data_unit: "litre" },
        ],
      ),
    ).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Factor lookup order: one case per step of the backend's save-time matcher
// (findEmissionFactorForCategory), so the preview and the saved total agree.
// ---------------------------------------------------------------------------
describe("factor lookup follows the backend's order", () => {
  const find = (factors: EmissionFactor[], category: string, targetYear?: number) =>
    createEmissionCalculator({ emissionFactors: factors, targetYear }).getEmissionFactor(category);

  it("1 · exact factor name in the target year beats an exact global name", () => {
    const want = ef("LPG", 1, "litre", 2024);
    expect(find([ef("Other", 2, "litre", 2024, "LPG"), want], "LPG", 2024)).toBe(want);
  });
  it("2 · exact global name in the target year beats an exact factor name from another year", () => {
    const want = ef("Diesel (avg)", 1, "litre", 2024, "Diesel");
    expect(find([ef("Diesel", 2, "litre", 2023), want], "Diesel", 2024)).toBe(want);
  });
  it("3 · without a target-year match, the newest exact factor name from any year", () => {
    const want = ef("LPG", 2, "litre", 2023);
    expect(find([ef("LPG", 1, "litre", 2021), want], "LPG", 2025)).toBe(want);
  });
  it("4 · then the newest exact global name from any year", () => {
    const want = ef("Diesel (avg)", 2, "litre", 2023, "Diesel");
    expect(find([ef("Diesel (old)", 1, "litre", 2021, "Diesel"), want], "Diesel", 2025)).toBe(want);
  });
  it("exact matches from any year come before a case-blind match in the target year", () => {
    const want = ef("LPG", 1, "litre", 2023);
    expect(find([ef("lpg", 2, "litre", 2025), want], "LPG", 2025)).toBe(want);
  });
  it("5 · a case-blind match on either name: the target year first, else the newest", () => {
    const inYear = ef(" lpg ", 1, "litre", 2024);
    expect(find([ef("Lpg", 2, "litre", 2025), inYear], "LPG", 2024)).toBe(inYear);
    const newestGlobal = ef("Other", 3, "litre", 2023, "lpg");
    expect(find([ef(" lpg", 1, "litre", 2021), newestGlobal], "LPG", 2025)).toBe(newestGlobal);
  });
  it("no factor when nothing matches", () => {
    expect(find([ef("Petrol", 1, "litre", 2024)], "LPG", 2024)).toBeUndefined();
  });
});

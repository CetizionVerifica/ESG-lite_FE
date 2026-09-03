import { useCallback } from "react";
import { getConversionFactor, unitsMatchExact } from "../../utils/unitConversions";
import { EmissionFactor, ModalRow, EmissionCalculationResult, ColumnEntity, EmissionCategoryMapping, CalculationSpec, MethodCalculation } from "./types";

// "tonne.km", "Tonne KM", "tonne-km", "tonne_km", "tkm" → "tonne.km"
// (mirrors backend services/calculationSpec.ts normalizeUnitKey)
export const normalizeUnitKey = (unit: unknown): string => {
  let u = String(unit ?? "").trim().toLowerCase().replace(/[\s_\-]+/g, ".");
  if (u === "tkm" || u === "t.km" || u === "tonnes.km" || u === "tonne.kms") u = "tonne.km";
  if (u === "kms") u = "km";
  return u;
};

// Which of the spec's methods applies to this row — by dropdown value
// (per_method) or by the row's unit (per_unit). null = not decidable yet.
export const resolveSpecMethod = (
  spec: CalculationSpec,
  row: ModalRow,
): { method: MethodCalculation; key: string } | null => {
  if (spec.mode === "per_unit") {
    const key = normalizeUnitKey(row.activity_data_unit);
    const method = key ? spec.methods[key] : undefined;
    return method?.multiply?.length ? { method, key } : null;
  }
  const value = spec.method_column ? row[spec.method_column] : undefined;
  if (!value) return null;
  const method = spec.methods[String(value)];
  return method?.multiply?.length ? { method, key: String(value) } : null;
};

// Every numeric column any method of the spec can use (to show them before a
// method/unit is chosen).
export const specNumericColumns = (spec: CalculationSpec): Set<string> => {
  const all = new Set<string>();
  Object.values(spec.methods).forEach((m) => m.multiply?.forEach((f) => all.add(f)));
  return all;
};

export const useEmissionCalculation = (
  emissionFactors: EmissionFactor[],
  targetYear?: number,
  columns?: ColumnEntity[],
  selectColumnNames?: string[],
  emissionCategoryMapping?: EmissionCategoryMapping,
  fallbackToRaw?: boolean,
  calculationSpec?: CalculationSpec | null
) => {
  // Helper: find EF with year filter, trying emission_category_name then global_category_name,
  // then falling back to company_category_name (JSONB key) if ECM mapping exists.
  const findFactor = useCallback(
    (emissionCategory: string): EmissionFactor | undefined => {
      const yearMatch = (f: EmissionFactor) =>
        targetYear === undefined || f.year === targetYear;

      // Step 1: match by emission_category_name (global_category_name from ECM)
      return emissionFactors.find(
        (f) => f.emission_category_name === emissionCategory && yearMatch(f)
      )
      // Step 2: match by global_category_name field on EF
      || emissionFactors.find(
        (f) => f.global_category_name === emissionCategory && yearMatch(f)
      )
      // Step 3: fallback — reverse-lookup the company_category_name (JSONB key) and try that
      || (() => {
        if (!emissionCategoryMapping) return undefined;
        const companyCatName = Object.entries(emissionCategoryMapping).find(
          ([, value]) => value === emissionCategory
        )?.[0];
        if (!companyCatName || companyCatName === emissionCategory) return undefined;
        return emissionFactors.find(
          (f) => f.emission_category_name === companyCatName && yearMatch(f)
        );
      })()
      // Step 4: normalized (trim + case-insensitive) match — guards against
      // whitespace/casing drift between factor names and the submitted value.
      || (() => {
        const target = emissionCategory.trim().toLowerCase();
        const norm = (s?: string) => (s ?? "").trim().toLowerCase();
        return emissionFactors.find(
          (f) => norm(f.emission_category_name) === target && yearMatch(f)
        ) || emissionFactors.find(
          (f) => norm(f.global_category_name) === target && yearMatch(f)
        );
      })();
    },
    [emissionFactors, targetYear, emissionCategoryMapping]
  );

  const getExpectedUnit = useCallback(
    (emissionCategory: string): string | null => {
      return findFactor(emissionCategory)?.denominator_unit || null;
    },
    [findFactor]
  );

  const getEmissionFactor = useCallback(
    (emissionCategory: string): EmissionFactor | undefined => {
      return findFactor(emissionCategory);
    },
    [findFactor]
  );

  const findActivityValue = useCallback((row: ModalRow): number | null => {
    // Build a set of column names to skip (select/dropdown columns and the
    // row's bookkeeping fields — a saved row carries its date, ids and totals,
    // which must never be mistaken for the activity value: "2026-03-31"
    // parses as 2026).
    const skipColumns = new Set<string>([
      "id", "emission_category", "activity_data_unit", "date_of_reporting",
      "pk_id", "total_emission", "site_id", "category_id", "created_by",
      "reviewed_by", "fera_linked_id", "reporting_period", "year_type",
      "activity_value",
    ]);

    // Add select-type columns to skip list (they contain dropdown IDs, not activity data)
    if (selectColumnNames) {
      selectColumnNames.forEach(name => skipColumns.add(name));
    }

    // Also skip columns that have column_type "select" based on columns prop
    if (columns) {
      columns.forEach(col => {
        if (col.column_type === "select") {
          skipColumns.add(col.column_name);
        }
      });
    }

    // Find the first numeric value from non-dropdown columns
    for (const [key, value] of Object.entries(row)) {
      // Skip composite-unit helper fields (e.g. quantity__multiplier, quantity__distance)
      if (key.endsWith("__multiplier") || key.endsWith("__distance")) continue;
      if (key.startsWith("_")) continue;
      if (!skipColumns.has(key)) {
        const numVal = parseFloat(value as string);
        if (!isNaN(numVal) && numVal > 0) {
          return numVal;
        }
      }
    }
    return null;
  }, [columns, selectColumnNames]);

  const calculateEmission = useCallback(
    (row: ModalRow): EmissionCalculationResult => {
      if (!row.emission_category) {
        return { value: null, status: "Select emission category" };
      }

      const factor = getEmissionFactor(row.emission_category);
      if (!factor) {
        console.log("[useEmissionCalculation] no factor matched", {
          searchedCategory: row.emission_category,
          targetYear,
          totalFactorsLoaded: emissionFactors.length,
          available: emissionFactors.map((f) => ({
            name: f.emission_category_name,
            global: f.global_category_name,
            year: f.year,
          })),
        });
        const yearMsg = targetYear !== undefined ? ` for year ${targetYear}` : "";
        return { value: null, status: `No emission factor found${yearMsg}` };
      }

      // Spec category (Use of Sold Products, Transport): the activity value is
      // the PRODUCT of the chosen method's fields — mirrors the backend exactly
      // (services/calculationSpec.ts), so the preview matches the saved total.
      let activityValue: number | null;
      if (calculationSpec) {
        const resolved = resolveSpecMethod(calculationSpec, row);
        if (!resolved) {
          return {
            value: null,
            status: calculationSpec.mode === "per_unit"
              ? (row.activity_data_unit ? "This unit is not configured for this category" : "Select unit")
              : `Select ${calculationSpec.method_column ?? "method"}`,
          };
        }
        const { method } = resolved;
        // Legacy rows (saved before the spec) hold the product in legacy_field
        // and don't carry the other fields at all.
        const legacy = calculationSpec.legacy_field;
        const others = legacy ? method.multiply.filter((f) => f !== legacy) : [];
        if (legacy && method.multiply.includes(legacy) && others.length > 0 && others.every((f) => !(f in row))) {
          const legacyValue = parseFloat(String(row[legacy] ?? ""));
          if (isNaN(legacyValue) || legacyValue <= 0) {
            return { value: null, status: `Enter ${legacy}` };
          }
          activityValue = legacyValue;
        } else {
          let product = 1;
          for (const fieldName of method.multiply) {
            const value = parseFloat(String(row[fieldName] ?? "").replace(/,/g, ""));
            if (isNaN(value) || value <= 0) {
              return { value: null, status: `Enter ${fieldName} (a number greater than 0)` };
            }
            if (method.percent?.includes(fieldName)) {
              if (value > 100) {
                return { value: null, status: `${fieldName} cannot be more than 100` };
              }
              product *= value / 100;
            } else {
              product *= value;
            }
          }
          activityValue = product;
        }
      } else {
        activityValue = findActivityValue(row);
      }
      if (activityValue === null) {
        return { value: null, status: "Enter activity data" };
      }

      if (!row.activity_data_unit) {
        return { value: null, status: "Select unit" };
      }

      const expectedUnit = factor.denominator_unit;
      const currentUnit = row.activity_data_unit;
      const isMatch = unitsMatchExact(expectedUnit, currentUnit);

      if (isMatch) {
        const emission = Math.round(((activityValue * factor.factor_value) / 1000) * 100) / 100;
        return { value: emission, status: "ok" };
      }

      const conversionFactor = getConversionFactor(currentUnit, expectedUnit);
      if (conversionFactor) {
        const convertedValue = activityValue * conversionFactor;
        const emission = Math.round(((convertedValue * factor.factor_value) / 1000) * 100) / 100;

        return { value: emission, status: "converted" };
      }

      // fallbackToRaw: use raw activity value when no conversion exists (e.g. FERA factors
      // where the factor already accounts for the fuel's energy content)
      if (fallbackToRaw) {
        const emission = Math.round(((activityValue * factor.factor_value) / 1000) * 100) / 100;
        return { value: emission, status: "ok" };
      }

      // Say WHY when the factor itself names its unit in brackets (transport's
      // "[km]" / "[tonne.km]" twins) — the fix is a different option or unit.
      const bracket = row.emission_category.match(/\[([^\]]+)\]/)?.[1];
      if (bracket) {
        return {
          value: null,
          status: `Unit mismatch - this option is per ${bracket}; choose the [${currentUnit}] option or switch the unit to ${bracket}`,
        };
      }
      return { value: null, status: "Unit mismatch - no conversion available" };
    },
    [getEmissionFactor, findActivityValue, targetYear, calculationSpec]
  );

  return {
    getExpectedUnit,
    getEmissionFactor,
    findActivityValue,
    calculateEmission,
  };
};

import { useCallback } from "react";
import { getConversionFactor, unitsMatchExact } from "../../utils/unitConversions";
import { EmissionFactor, ModalRow, EmissionCalculationResult, ColumnEntity, EmissionCategoryMapping } from "./types";

export const useEmissionCalculation = (
  emissionFactors: EmissionFactor[],
  targetYear?: number,
  columns?: ColumnEntity[],
  selectColumnNames?: string[],
  emissionCategoryMapping?: EmissionCategoryMapping
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
    // Build a set of column names to skip (select/dropdown columns)
    const skipColumns = new Set<string>(["id", "emission_category", "activity_data_unit"]);

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
        const yearMsg = targetYear !== undefined ? ` for year ${targetYear}` : "";
        return { value: null, status: `No emission factor found${yearMsg}` };
      }

      const activityValue = findActivityValue(row);
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

      return { value: null, status: "Unit mismatch - no conversion available" };
    },
    [getEmissionFactor, findActivityValue, targetYear]
  );

  return {
    getExpectedUnit,
    getEmissionFactor,
    findActivityValue,
    calculateEmission,
  };
};

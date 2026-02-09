import { useCallback } from "react";
import { getConversionFactor, unitsMatchExact } from "../../utils/unitConversions";
import { EmissionFactor, ModalRow, EmissionCalculationResult, ColumnEntity } from "./types";

export const useEmissionCalculation = (
  emissionFactors: EmissionFactor[],
  targetYear?: number,
  columns?: ColumnEntity[],
  selectColumnNames?: string[]
) => {
  const getExpectedUnit = useCallback(
    (emissionCategory: string): string | null => {
      // Filter by year if targetYear is provided
      const factor = emissionFactors.find(
        (f) => f.emission_category_name === emissionCategory &&
               (targetYear === undefined || f.year === targetYear)
      );
      return factor?.denominator_unit || null;
    },
    [emissionFactors, targetYear]
  );

  const getEmissionFactor = useCallback(
    (emissionCategory: string): EmissionFactor | undefined => {
      // Filter by year if targetYear is provided
      return emissionFactors.find(
        (f) => f.emission_category_name === emissionCategory &&
               (targetYear === undefined || f.year === targetYear)
      );
    },
    [emissionFactors, targetYear]
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

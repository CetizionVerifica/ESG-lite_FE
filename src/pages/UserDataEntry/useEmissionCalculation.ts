// The calculation moved to src/features/add-data/hooks/emissionCalc.ts (pure
// functions with golden snapshot tests). This wrapper keeps the legacy page's
// call signature until P03-C deletes the page.
import { useEmissionCalc } from "../../features/add-data/hooks/useEmissionCalc";
import { EmissionFactor, ColumnEntity, EmissionCategoryMapping, CalculationSpec } from "./types";

export { normalizeUnitKey, resolveSpecMethod, specNumericColumns } from "../../features/add-data/hooks/emissionCalc";

export const useEmissionCalculation = (
  emissionFactors: EmissionFactor[],
  targetYear?: number,
  columns?: ColumnEntity[],
  selectColumnNames?: string[],
  // Kept for the call signature; the save-time matcher never uses the
  // client's own category name, so the preview doesn't either.
  _emissionCategoryMapping?: EmissionCategoryMapping,
  fallbackToRaw?: boolean,
  calculationSpec?: CalculationSpec | null
) =>
  useEmissionCalc({
    emissionFactors,
    targetYear,
    columns,
    selectColumnNames,
    fallbackToRaw,
    calculationSpec,
  });

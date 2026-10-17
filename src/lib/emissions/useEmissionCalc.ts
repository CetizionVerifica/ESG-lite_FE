import { useMemo } from "react";
import { createEmissionCalculator, type EmissionCalcInput } from "./emissionCalc";

// React binding of the pure calculator: recomputed only when an input changes.
export const useEmissionCalc = ({
  emissionFactors,
  targetYear,
  columns,
  selectColumnNames,
  fallbackToRaw,
  calculationSpec,
  spendRates,
  spendRateErrors,
  reportingDate,
  reportingPeriod,
}: EmissionCalcInput) =>
  useMemo(
    () =>
      createEmissionCalculator({
        emissionFactors,
        targetYear,
        columns,
        selectColumnNames,
        fallbackToRaw,
        calculationSpec,
        spendRates,
        spendRateErrors,
        reportingDate,
        reportingPeriod,
      }),
    [emissionFactors, targetYear, columns, selectColumnNames, fallbackToRaw, calculationSpec, spendRates, spendRateErrors, reportingDate, reportingPeriod],
  );

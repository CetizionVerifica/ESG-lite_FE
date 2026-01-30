import { useMemo } from "react";
import { EmissionData } from "../../../services/emissionService";

interface YoYData {
  currentValue: number;
  previousValue: number;
  currentYear: number;
  previousYear: number;
}

interface UseYoYEmissionsProps {
  approvedEmissions: EmissionData[];
  selectedYear: number | null;
}

interface UseYoYEmissionsResult {
  totalYoY: YoYData;
  scope1YoY: YoYData;
  scope2YoY: YoYData;
  scope3YoY: YoYData;
}

export function useYoYEmissions({
  approvedEmissions,
  selectedYear,
}: UseYoYEmissionsProps): UseYoYEmissionsResult {
  const currentYear = selectedYear || new Date().getFullYear();
  const previousYear = currentYear - 1;

  const result = useMemo(() => {
    // Filter emissions by year
    const currentYearEmissions = approvedEmissions.filter((e) => {
      const year = new Date(e.date_of_reporting).getFullYear();
      return year === currentYear;
    });

    const previousYearEmissions = approvedEmissions.filter((e) => {
      const year = new Date(e.date_of_reporting).getFullYear();
      return year === previousYear;
    });

    // Calculate totals
    const calculateTotal = (emissions: EmissionData[]) =>
      emissions.reduce((sum, e) => sum + (Number(e.total_emission) || 0), 0);

    // Calculate by scope
    const calculateByScope = (emissions: EmissionData[], scope: string) =>
      emissions
        .filter((e) => e.category?.scope === scope)
        .reduce((sum, e) => sum + (Number(e.total_emission) || 0), 0);

    return {
      totalYoY: {
        currentValue: calculateTotal(currentYearEmissions),
        previousValue: calculateTotal(previousYearEmissions),
        currentYear,
        previousYear,
      },
      scope1YoY: {
        currentValue: calculateByScope(currentYearEmissions, "Scope 1"),
        previousValue: calculateByScope(previousYearEmissions, "Scope 1"),
        currentYear,
        previousYear,
      },
      scope2YoY: {
        currentValue: calculateByScope(currentYearEmissions, "Scope 2"),
        previousValue: calculateByScope(previousYearEmissions, "Scope 2"),
        currentYear,
        previousYear,
      },
      scope3YoY: {
        currentValue: calculateByScope(currentYearEmissions, "Scope 3"),
        previousValue: calculateByScope(previousYearEmissions, "Scope 3"),
        currentYear,
        previousYear,
      },
    };
  }, [approvedEmissions, currentYear, previousYear]);

  return result;
}

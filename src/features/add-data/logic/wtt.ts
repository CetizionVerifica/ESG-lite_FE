/**
 * D6a: a Category 4, 6, 7 or 9 row's total includes the well-to-tank (WTT)
 * part of the carrier's or traveller's fuel, as the engine adds it (ESG-lite
 * emissionWrite/methods/fera.ts `wttPartFor`): the FERA factor of the same
 * name for the factor year, on a quantity × factor row whose factor doesn't
 * already include WTT. Supplier, spend and spec rows get none.
 */
import type { EmissionCalculator } from "../../../lib/emissions/emissionCalc";
import type { ModalRow } from "../../../lib/emissions/types";
import { tonnesWithWtt } from "../../../lib/scope3/fera";
import { supplierMethodOf } from "./supplier";

/** The page's calculator with each row's WTT part added; `wtt` resolves against the site's FERA (wtt) factors. */
export function withWttInRow(calc: EmissionCalculator, wtt: EmissionCalculator): EmissionCalculator {
  const wttKgOf = (row: ModalRow): number | null => {
    if (!row.emission_category || supplierMethodOf(row)) return null;
    const factor = calc.getEmissionFactor(row.emission_category);
    if (!factor || factor.includes_wtt || !wtt.getEmissionFactor(row.emission_category)) return null;
    return wtt.emissionKg(row);
  };
  const calculateEmission = (row: ModalRow) => {
    const result = calc.calculateEmission(row);
    // Only a quantity × factor row has kg: spend and supplier figures never get a WTT part.
    const rowKg = result.value !== null && !supplierMethodOf(row) ? calc.emissionKg(row) : null;
    const wttKg = rowKg === null ? null : wttKgOf(row);
    return rowKg === null || wttKg === null ? result : { ...result, value: tonnesWithWtt(rowKg, wttKg), wtt_kg: wttKg };
  };
  return { ...calc, calculateEmission };
}

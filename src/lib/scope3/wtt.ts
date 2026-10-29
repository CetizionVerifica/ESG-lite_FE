/**
 * D6a: a Category 4, 6, 7 or 9 row's total includes the well-to-tank (WTT)
 * part of the carrier's or traveller's fuel, as the engine adds it (ESG-lite
 * emissionWrite/methods/fera.ts `wttPartFor`): the FERA factor of the same
 * name for the factor year, on a quantity × factor row whose factor doesn't
 * already include WTT. Supplier, spend and spec rows get none, and neither
 * does an edit of a saved entry that kept its Category 3 twin (`_keepsFeraTwin`,
 * the server's keep_fera_twin). Shared by Add data and My entries' edit form.
 */
import { ROW_METHOD_COLUMN, type EmissionCalculator } from "../emissions/emissionCalc";
import type { ModalRow } from "../emissions/types";
import { tonnesWithWtt } from "./fera";

// S3-6: a supplier-specific or hybrid row is calculated from the supplier's figures, never with WTT.
const supplierMethodRow = (row: ModalRow) => row[ROW_METHOD_COLUMN] === "supplier_specific" || row[ROW_METHOD_COLUMN] === "hybrid";

/** The page's calculator with each row's WTT part added; `wtt` resolves against the site's FERA (wtt) factors. */
export function withWttInRow(calc: EmissionCalculator, wtt: EmissionCalculator): EmissionCalculator {
  const wttKgOf = (row: ModalRow): number | null => {
    const name = row.emission_category;
    if (!name || supplierMethodRow(row) || row._keepsFeraTwin) return null;
    const factor = calc.getEmissionFactor(name);
    if (!factor || factor.includes_wtt) return null;
    // The engine takes a FERA factor by its exact name or global name only, never a near spelling.
    const wttFactor = wtt.getEmissionFactor(name);
    if (!wttFactor || (wttFactor.emission_category_name !== name && wttFactor.global_category_name !== name)) return null;
    return wtt.emissionKg(row);
  };
  const calculateEmission = (row: ModalRow) => {
    const result = calc.calculateEmission(row);
    // Only a quantity × factor row has kg: spend and supplier figures never get a WTT part.
    const rowKg = result.value !== null && !supplierMethodRow(row) ? calc.emissionKg(row) : null;
    const wttKg = rowKg === null ? null : wttKgOf(row);
    return rowKg === null || wttKg === null ? result : { ...result, value: tonnesWithWtt(rowKg, wttKg), wtt_kg: wttKg };
  };
  return { ...calc, calculateEmission };
}

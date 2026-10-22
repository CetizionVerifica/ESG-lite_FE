/**
 * MSW handlers for #183: GET /user/units/site/:siteId/category/:categoryId/by-activity and its
 * Superadmin twin under /admin. Site 4 × Stationary Combustion (1) lists Diesel, an alias and
 * Natural gas; site 4 × Purchased Electricity (4) fixes the unit. Anything else is 403, as the
 * server answers a category the site doesn't report.
 */
import { http, HttpResponse } from "msw";
import type { UnitOptionsByActivity } from "../../lib/emissions/unitOptions";

export const unitOptionsData: Record<string, UnitOptionsByActivity> = {
  "4:1": {
    fixed_unit: null,
    all_units: ["litre", "kl", "gallon", "SCM", "kg", "kWh"],
    activities: [
      { name: "Diesel", factor_unit: "litre", units: ["litre", "kl", "gallon", "SCM"] },
      { name: "HSD", maps_to: "Diesel", factor_unit: "litre", units: ["litre", "kl", "gallon", "SCM"] },
      { name: "Natural gas", factor_unit: "cubic meter", units: ["SCM", "litre", "kl", "gallon"] },
    ],
  },
  "4:4": {
    fixed_unit: "MWh",
    all_units: ["kWh", "MWh"],
    activities: [{ name: "Grid electricity", factor_unit: "kWh", units: ["MWh"] }],
  },
};

const answer = ({ params }: { params: Record<string, string | readonly string[] | undefined> }) => {
  const data = unitOptionsData[`${params.siteId}:${params.categoryId}`];
  return data ? HttpResponse.json(data) : HttpResponse.json({ message: "This category isn't assigned to the site" }, { status: 403 });
};

export const unitHandlers = [
  http.get("*/user/units/site/:siteId/category/:categoryId/by-activity", answer),
  http.get("*/admin/units/site/:siteId/category/:categoryId/by-activity", answer),
];

import api from "../api/axios";
import type { EmissionStatus } from "./emissionService";

/** One emission category (fuel type, waste stream …) within a category. */
export interface BreakdownGroup {
  emission_category: string;
  entries: number;
  /** tCO₂e. */
  total_emission: number;
  consumption: number;
  /** Shared unit of the entries, "mixed" when they differ, null when none. */
  unit: string | null;
}

export interface EmissionBreakdown {
  category_id: number;
  entries: number;
  groups: BreakdownGroup[];
}

/** GET /user/emissions/breakdown: same filters as the paginated emissions list. */
export const getEmissionBreakdown = async (params: {
  categoryId: number;
  siteIds?: number[];
  status?: EmissionStatus | null;
  year?: number | null;
  month?: number | null;
  search?: string;
}): Promise<EmissionBreakdown> => {
  const query: Record<string, string | number> = { categoryId: params.categoryId };
  if (params.siteIds?.length) query.siteIds = params.siteIds.join(",");
  if (params.status) query.status = params.status;
  if (params.year) query.year = params.year;
  if (params.month) query.month = params.month;
  if (params.search?.trim()) query.search = params.search.trim();
  const response = await api.get("/user/emissions/breakdown", { params: query });
  return response.data;
};

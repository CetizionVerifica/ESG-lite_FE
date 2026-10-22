import api from "../api/axios";
import { readUnitOptions, type UnitOptionsByActivity } from "../lib/emissions/unitOptions";

export interface UnitData {
  unit_id: number;
  unit_name: string;
  description: string | null;
  site: {
    site_id: number;
    name: string;
  };
  category: {
    category_id: number;
    category_name: string;
  };
}

// Admin endpoints
export const getUnits = async () => {
  const response = await api.get("/admin/units");
  return response.data;
};

export const getUnitById = async (id: string | number) => {
  const response = await api.get(`/admin/units/${id}`);
  return response.data;
};

export const getUnitsBySiteAndCategory = async (
  siteId: string | number,
  categoryId: string | number
) => {
  const response = await api.get(`/admin/units/site/${siteId}/category/${categoryId}`);
  return response.data;
};

export const createUnit = async (data: {
  unit_name: string;
  description?: string;
  site_id: number;
  category_id: number;
}) => {
  const response = await api.post("/admin/units", data);
  return response.data;
};

export const updateUnit = async (
  id: string | number,
  data: {
    unit_name?: string;
    description?: string;
    site_id?: number;
    category_id?: number;
  }
) => {
  const response = await api.put(`/admin/units/${id}`, data);
  return response.data;
};

export const deleteUnit = async (id: string | number) => {
  const response = await api.delete(`/admin/units/${id}`);
  return response.data;
};

// User endpoint (non-admin)
export const getUserUnitsBySiteAndCategory = async (
  siteId: string | number,
  categoryId: string | number
) => {
  const response = await api.get(`/user/units/site/${siteId}/category/${categoryId}`);
  return response.data;
};

/**
 * #183: the units each emission category of a site × category may use. Null when the API
 * answers something else (an older backend): the forms then offer every unit, as before.
 */
export const getUserUnitOptions = async (siteId: string | number, categoryId: string | number): Promise<UnitOptionsByActivity | null> => {
  const response = await api.get(`/user/units/site/${siteId}/category/${categoryId}/by-activity`);
  return readUnitOptions(response.data);
};

/** The Superadmin twin of getUserUnitOptions (Capture setup's test row). */
export const getAdminUnitOptions = async (siteId: string | number, categoryId: string | number): Promise<UnitOptionsByActivity | null> => {
  const response = await api.get(`/admin/units/site/${siteId}/category/${categoryId}/by-activity`);
  return readUnitOptions(response.data);
};

/**
 * #183 U3-FE: for every unit row, the emission categories (factor names) of its site × category
 * that may use it; an empty list = it fits none. Null when the API has no such list (older backend).
 */
export const getUnitFits = async (): Promise<Map<number, string[]> | null> => {
  let response;
  try {
    response = await api.get("/admin/units/fits");
  } catch (e) {
    // An older API has no such route; anything else (the API restarting, a timeout) is retried by the caller.
    if ((e as { response?: { status?: number } })?.response?.status === 404) return null;
    throw e;
  }
  const fits = (response.data as { fits?: unknown } | null)?.fits;
  if (!Array.isArray(fits)) return null;
  const out = new Map<number, string[]>();
  for (const f of fits as Array<{ unit_id?: unknown; activities?: unknown }>) {
    if (typeof f?.unit_id === "number" && Array.isArray(f.activities)) out.set(f.unit_id, f.activities.filter((a): a is string => typeof a === "string"));
  }
  return out;
};

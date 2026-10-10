import api from "../api/axios";

// PCF material factor library (E1 + C04 backend, /pcf/material-factors).

export type MaterialFactorBody = {
  company_id?: number | null;
  name?: string;
  material_group?: string;
  geography?: string | null;
  unit?: string;
  value_kgco2e?: number;
  gwp_set?: "AR6" | "AR5";
  source?: string | null;
  source_year?: number | null;
  dataset_ref?: string | null;
  licence?: "open" | "ecoinvent" | "supplier";
  recycled_variant?: boolean;
  valid_from?: string | null;
  valid_to?: string | null;
};

export const getMaterialFactors = async () => {
  const response = await api.get("/pcf/material-factors");
  return response.data;
};

export const getMaterialFactor = async (id: number) => {
  const response = await api.get(`/pcf/material-factors/${id}`);
  return response.data;
};

export const createMaterialFactor = async (data: MaterialFactorBody) => {
  const response = await api.post("/pcf/material-factors", data);
  return response.data;
};

export const updateMaterialFactor = async (id: number, data: MaterialFactorBody) => {
  const response = await api.patch(`/pcf/material-factors/${id}`, data);
  return response.data;
};

export const deleteMaterialFactor = async (id: number) => {
  // data-loss-reviewed: deletes one unused material factor after the Delete dialog naming it is confirmed; the server refuses (409) while any footprint line uses it.
  await api.delete(`/pcf/material-factors/${id}`);
};

export const importMaterialFactors = async (data: { company_id?: number | null; rows: MaterialFactorBody[] }) => {
  const response = await api.post("/pcf/material-factors/import", data);
  return response.data;
};

/** Validates an import without saving: every invalid row and every row already in the library. */
export const checkMaterialFactorImport = async (data: { company_id?: number | null; rows: MaterialFactorBody[] }) => {
  const response = await api.post("/pcf/material-factors/import?dry_run=1", data);
  return response.data;
};

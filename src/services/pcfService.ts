import api from "../api/axios";

// PCF studies and plant reconciliation (E1 backend, /pcf/studies and /pcf/reconciliation).

export type PcfStudyStatus = "draft" | "in_review" | "approved" | "published" | "superseded";

export const getPcfStudies = async (params?: { siteId?: number; productId?: number; status?: PcfStudyStatus }) => {
  const response = await api.get("/pcf/studies", { params });
  return response.data;
};

export const getPcfReconciliation = async (params: { siteId: number; start: string; end: string }) => {
  const response = await api.get("/pcf/reconciliation", { params });
  return response.data;
};

export const getPcfStudy = async (id: number) => {
  const response = await api.get(`/pcf/studies/${id}`);
  return response.data;
};

export const createPcfStudy = async (data: Record<string, unknown>) => {
  const response = await api.post("/pcf/studies", data);
  return response.data;
};

export const updatePcfStudy = async (id: number, data: Record<string, unknown>) => {
  const response = await api.patch(`/pcf/studies/${id}`, data);
  return response.data;
};

export const replacePcfInputs = async (id: number, inputs: unknown[]) => {
  const response = await api.put(`/pcf/studies/${id}/inputs`, { inputs });
  return response.data;
};

export type KeyValues = { key_value_product?: number | null; key_value_site_total?: number | null };

export const getPcfAllocationPreview = async (id: number, params?: KeyValues) => {
  const response = await api.get(`/pcf/studies/${id}/allocation-preview`, { params });
  return response.data;
};

export const calculatePcfStudy = async (id: number, body?: KeyValues) => {
  const response = await api.post(`/pcf/studies/${id}/calculate`, body ?? {});
  return response.data;
};

export const submitPcfStudy = async (id: number) => {
  const response = await api.post(`/pcf/studies/${id}/submit`);
  return response.data;
};

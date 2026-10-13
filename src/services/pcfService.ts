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

export const approvePcfStudy = async (id: number, comment?: string) => {
  const response = await api.post(`/pcf/studies/${id}/approve`, comment ? { comment } : {});
  return response.data;
};

export const rejectPcfStudy = async (id: number, comment: string) => {
  const response = await api.post(`/pcf/studies/${id}/reject`, { comment });
  return response.data;
};

export const publishPcfStudy = async (id: number) => {
  const response = await api.post(`/pcf/studies/${id}/publish`);
  return response.data;
};

/** C03: the stored result behind a calculated footprint (lines, allocation, ids used). */
export const getPcfStudyResult = async (id: number) => {
  const response = await api.get(`/pcf/studies/${id}/result`);
  return response.data;
};

export const getPcfStudyAudit = async (id: number) => {
  const response = await api.get(`/pcf/studies/${id}/audit`);
  return response.data;
};

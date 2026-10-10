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

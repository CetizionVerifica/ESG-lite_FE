import api from "../api/axios";

// Copy client setup (Superadmin): ESG-lite docs/setup-copy.md.

export const getSetupBundle = async (companyId: number) => {
  const response = await api.get(`/admin/companies/${companyId}/setup-bundle`);
  return response.data;
};

export const previewSetupCopy = async (body: Record<string, unknown>) => {
  const response = await api.post(`/admin/setup-copy/preview`, body);
  return response.data;
};

export const applySetupCopy = async (companyId: number, body: Record<string, unknown>) => {
  const response = await api.post(`/admin/companies/${companyId}/setup-copy`, body);
  return response.data;
};

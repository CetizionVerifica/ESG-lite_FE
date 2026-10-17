import api from "../api/axios";

// SE-6 · Form templates and copy (Superadmin). ESG-lite src/forms/templates.ts.

export const getFormTemplates = async (params: { category_id?: number; company_id?: number } = {}) => {
  const response = await api.get("/admin/form-templates", { params });
  return response.data;
};

/** "Save as template": `company_id` null makes it a template for every client; omitted keeps the form's client. */
export const createFormTemplate = async (body: { form_id: number; name: string; company_id?: number | null }) => {
  const response = await api.post("/admin/form-templates", body);
  return response.data;
};

export const renameFormTemplate = async (id: number, name: string) => {
  const response = await api.put(`/admin/form-templates/${id}`, { name });
  return response.data;
};

export const deleteFormTemplate = async (id: number) => {
  // data-loss-reviewed: deletes one template after a destructive confirm naming it; forms made from it stay
  const response = await api.delete(`/admin/form-templates/${id}`);
  return response.data;
};

export type ApplySource = { template_id: number } | { form_id: number };

export const previewFormTemplateApply = async (body: ApplySource & { site_ids: number[] }) => {
  const response = await api.post("/admin/form-templates/apply/preview", body);
  return response.data;
};

export const applyFormTemplate = async (body: ApplySource & { site_ids: number[]; note?: string | null }) => {
  const response = await api.post("/admin/form-templates/apply", body);
  return response.data;
};

export const seedFormTemplates = async (body: { company_id: number; dry_run?: boolean }) => {
  const response = await api.post("/admin/form-templates/seed", body);
  return response.data;
};

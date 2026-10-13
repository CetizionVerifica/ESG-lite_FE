import api from "../api/axios";

// PCF supplier data requests (C06 backend, /pcf/supplier-requests and the
// supplier's public link /public/supplier-requests/:token).

export type SupplierRequestStatus = "sent" | "opened" | "received" | "accepted" | "rejected" | "expired";
export type Boundary = "cradle_to_gate" | "cradle_to_grave" | "gate_to_gate";
export type MailMode = "sink" | "live";

export type SupplierReply = {
  value_kgco2e: number | null;
  unit: string | null;
  boundary: Boundary | null;
  standard: string | null;
  gwp_set: string | null;
  reference_start: string | null;
  reference_end: string | null;
  valid_from: string | null;
  valid_to: string | null;
  verifier: string | null;
  product_name: string | null;
  note: string | null;
  file: { name: string; type: string | null; size: number | null } | null;
  boundary_mismatch: boolean;
};

export type SupplierRequest = {
  supplier_request_id: number;
  company_id: number | null;
  study: {
    pcf_study_id: number;
    version: number;
    status: string;
    boundary: "cradle_to_gate" | "cradle_to_grave";
    product: { product_id: number; name: string } | null;
    site: { site_id: number; name: string } | null;
  } | null;
  input: { pcf_input_id: number; name: string; stage: string; unit: string } | null;
  material: string;
  unit: string;
  supplier_name: string | null;
  supplier_email: string;
  due_date: string | null;
  subject: string;
  message: string;
  status: SupplierRequestStatus;
  link_expires_at: string;
  sent_at: string | null;
  opened_at: string | null;
  received_at: string | null;
  decided_at: string | null;
  requested_by: { user_id: number; name: string } | null;
  decided_by: { user_id: number; name: string } | null;
  decision_comment: string | null;
  reply: SupplierReply | null;
  accepted: { material_factor_id: number | null; value_kgco2e: number | null; boundary: string | null } | null;
  created_at: string;
  updated_at: string;
};

export type Delivery = { mode: MailMode; delivered: boolean; reason: string | null };

export type ListResponse = { requests: SupplierRequest[]; mail_mode: MailMode };
export type SendResponse = { request: SupplierRequest; link: string; mail: Delivery };

export type NewRequest = {
  study_id: number;
  input_id?: number | null;
  material?: string;
  unit?: string;
  supplier_email: string;
  supplier_name?: string | null;
  due_date?: string | null;
  note?: string | null;
};

export type PreviewParams = Omit<NewRequest, "supplier_email"> & { supplier_name?: string | null };

export type AcceptBody = {
  value_kgco2e: number;
  boundary?: Boundary | null;
  confirm_boundary?: boolean;
  standard?: string | null;
  gwp_set?: "AR6" | "AR5" | null;
  valid_from?: string | null;
  valid_to?: string | null;
  verifier?: string | null;
  source?: string | null;
  comment?: string | null;
};

export type AcceptResponse = { request: SupplierRequest; material_factor_id: number; applied_to_input: boolean; note: string | null };

export const getSupplierRequests = async (params?: { study?: number; product?: number; status?: SupplierRequestStatus }): Promise<ListResponse> => {
  const res = await api.get("/pcf/supplier-requests", { params });
  return res.data;
};

export const getSupplierRequest = async (id: number): Promise<{ request: SupplierRequest; mail_mode: MailMode }> => {
  const res = await api.get(`/pcf/supplier-requests/${id}`);
  return res.data;
};

export const previewSupplierMessage = async (params: PreviewParams): Promise<{ subject: string; text: string; link_placeholder: string; mail_mode: MailMode }> => {
  const res = await api.get("/pcf/supplier-requests/preview", {
    params: { study_id: params.study_id, input_id: params.input_id ?? undefined, material: params.material, unit: params.unit, supplier_name: params.supplier_name ?? undefined, due_date: params.due_date ?? undefined, note: params.note ?? undefined },
  });
  return res.data;
};

export const createSupplierRequest = async (body: NewRequest): Promise<SendResponse> => {
  const res = await api.post("/pcf/supplier-requests", body);
  return res.data;
};

export const resendSupplierRequest = async (id: number, body?: { due_date?: string | null }): Promise<SendResponse> => {
  const res = await api.post(`/pcf/supplier-requests/${id}/resend`, body ?? {});
  return res.data;
};

export const deleteSupplierRequest = async (id: number): Promise<void> => {
  // data-loss-reviewed: deletes one supplier request that has no answer yet, after the "Delete this request?" dialog naming the supplier is confirmed; the server refuses (409) once an answer was received. OK'd by Shyam 2026-10-13.
  await api.delete(`/pcf/supplier-requests/${id}`);
};

export const acceptSupplierRequest = async (id: number, body: AcceptBody): Promise<AcceptResponse> => {
  const res = await api.post(`/pcf/supplier-requests/${id}/accept`, body);
  return res.data;
};

export const rejectSupplierRequest = async (id: number, comment: string): Promise<{ request: SupplierRequest }> => {
  const res = await api.post(`/pcf/supplier-requests/${id}/reject`, { comment });
  return res.data;
};

/** The declaration the supplier uploaded, as a blob with its file name. */
export const getSupplierRequestFile = async (id: number): Promise<{ blob: Blob; disposition: string | null }> => {
  const res = await api.get(`/pcf/supplier-requests/${id}/file`, { responseType: "blob" });
  return { blob: res.data as Blob, disposition: (res.headers?.["content-disposition"] as string | undefined) ?? null };
};

// ---- the supplier's side (no account; the token is the key) ----

export type PublicRequest = {
  company: string;
  product: string | null;
  material: string;
  unit: string;
  boundary: "cradle_to_gate" | "cradle_to_grave";
  due_date: string | null;
  supplier_name: string | null;
  status: SupplierRequestStatus;
  received_at: string | null;
  reply: {
    value_kgco2e: number | null;
    unit: string | null;
    boundary: Boundary | null;
    standard: string | null;
    reference_start: string | null;
    reference_end: string | null;
    valid_from: string | null;
    valid_to: string | null;
    verifier: string | null;
    file: { name: string; size: number | null } | null;
  } | null;
};

export type PublicSubmission = {
  file?: File | null;
  value_kgco2e?: number | null;
  unit?: string | null;
  boundary?: Boundary | null;
  standard?: string | null;
  gwp_set?: "AR6" | "AR5" | null;
  reference_start?: string | null;
  reference_end?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  verifier?: string | null;
  product_name?: string | null;
  note?: string | null;
};

export const openPublicRequest = async (token: string): Promise<PublicRequest> => {
  const res = await api.get(`/public/supplier-requests/${encodeURIComponent(token)}`);
  return res.data;
};

export const submitPublicRequest = async (token: string, s: PublicSubmission): Promise<PublicRequest & { message: string }> => {
  const form = new FormData();
  if (s.file) form.append("file", s.file, s.file.name);
  for (const [k, v] of Object.entries(s)) {
    if (k === "file" || v === null || v === undefined || v === "") continue;
    form.append(k, String(v));
  }
  const res = await api.post(`/public/supplier-requests/${encodeURIComponent(token)}/submit`, form, { headers: { "Content-Type": "multipart/form-data" } });
  return res.data;
};

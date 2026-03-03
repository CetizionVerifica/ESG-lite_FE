import api from "../api/axios";

export interface AllDataEntry {
    id: number;
    site: { site_id: number; name: string };
    masterData: { id: number; title: string; code: string; response_type: "Numeric" | "Text" };
    value: number | null;
    text_value?: string | null;
    unit: string;
    reporting_date: string; // ISO Date
    status: "Draft" | "Ready for Review" | "Submitted" | "Verified" | "Rejected";
    notes?: string;
    evidence_path?: string;
    created_by?: { user_id: number; name: string };
    reviewed_by?: { user_id: number; name: string };
    review_comment?: string;
    reviewed_at?: string;
}

export const createEntry = async (data: Partial<AllDataEntry>): Promise<AllDataEntry> => {
    const response = await api.post("/all-data-entry", data);
    return response.data;
};

export const getEntries = async (params: { site_id?: number; month?: number; year?: number; status?: string; category_id?: number; subcategory_id?: number; }): Promise<AllDataEntry[]> => {
    const response = await api.get("/all-data-entry", { params });
    return response.data;
};

export const updateEntry = async (id: number, data: Partial<AllDataEntry>): Promise<AllDataEntry> => {
    const response = await api.put(`/all-data-entry/${id}`, data);
    return response.data;
};

export const deleteEntry = async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/all-data-entry/${id}`); // Permanent delete
    return response.data;
};

export const reviewEntry = async (id: number, status: string, review_comment?: string): Promise<AllDataEntry> => {
    const response = await api.patch(`/all-data-entry/${id}/review`, { status, review_comment });
    return response.data;
};

export const bulkUpdateStatus = async (ids: number[], status: string, review_comment?: string): Promise<any> => {
    const response = await api.post(`/all-data-entry/bulk-status`, { ids, status, review_comment });
    return response.data;
};

export const parseBulkExcel = async (formData: FormData): Promise<any> => {
    const response = await api.post("/all-data-entry/bulk-upload/parse", formData, {
        headers: { "Content-Type": "multipart/form-data" }
    });
    return response.data;
};

export const storeBulkExcel = async (data: any): Promise<any> => {
    const response = await api.post("/all-data-entry/bulk-upload/store", data);
    return response.data;
};

export const downloadDemoExcel = async (siteId: number, categoryId?: number | null, subcategoryId?: number | null, month?: number | 'all', year?: number): Promise<Blob> => {
    const params = new URLSearchParams({ site_id: siteId.toString() });
    if (categoryId) params.append('category_id', categoryId.toString());
    if (subcategoryId) params.append('subcategory_id', subcategoryId.toString());
    if (month) params.append('month', month.toString());
    if (year) params.append('year', year.toString());

    const response = await api.get(`/all-data-entry/bulk-upload/demo?${params.toString()}`, {
        responseType: 'blob'
    });
    return response.data;
};

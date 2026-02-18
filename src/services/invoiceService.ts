import ocrApi from "../api/ocrAxios";

// --- TypeScript Interfaces ---

export interface LineItem {
    description: string;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    amount: number | null;
}

export interface InvoiceData {
    invoice_number: string | null;
    invoice_date: string | null;
    vendor_name: string | null;
    vendor_address: string | null;
    subtotal: number | null;
    total_amount: number | null;
    currency: string | null;
    tax_amount: number | null;
    line_items: LineItem[];
    activity_description: string | null;
    total_quantity: number | null;
    unit_of_measurement: string | null;
    emission_category: string | null;
}

export interface ValidationCheck {
    check: string;
    ok: boolean;
    // totals check fields
    subtotal?: number;
    tax?: number;
    total?: number;
    expected?: number;
    delta?: number;
    // generic warning fields
    message?: string;
    emission_category?: string | null;
}

export interface CategorySuggestion {
    emission_category_name: string;
    category_id: number;
    category_name: string;
    scope: string | null;
    denominator_unit: string | null;
    confidence: number;
}

export interface EmissionReady {
    site_id: number | null;
    category_id: number | null;
    activity_data: Record<string, string>;
    activity_data_unit: string | null;
    date_of_reporting: string | null;
    total_emission: number;
    unit: string;
}

export interface ExtractionResponse {
    filename: string;
    data: InvoiceData[];
    error: string | null;
    validations: ValidationCheck[][];
    suggested_categories: (CategorySuggestion | null)[];
    emission: EmissionReady[];
    cloudinary_url?: string;
}

export interface Invoice {
    invoice_id: number;
    file_name: string;
    cloudinary_url: string;
    cloudinary_public_id: string;
    file_type: string;
    file_size: number;
    ocr_text: InvoiceData[] | null;
    uploaded_by: number | null;
    site_id: number | null;
    category_id: number | null;
    emission_id: number | null;
    created_at: string;
    updated_at: string;
}

// --- API Functions ---

export const checkOcrHealth = async () => {
    const response = await ocrApi.get<{ status: string }>("/health");
    return response.data;
};

export const uploadAndExtractInvoice = async (data: {
    file: File;
    category?: string;
    site_id?: number;
    category_id?: number;
    uploaded_by?: number;
    unit_names?: string[];
}) => {
    const formData = new FormData();
    formData.append("file", data.file);
    if (data.category) formData.append("category", data.category);
    if (data.site_id) formData.append("site_id", data.site_id.toString());
    if (data.category_id)
        formData.append("category_id", data.category_id.toString());
    if (data.uploaded_by)
        formData.append("uploaded_by", data.uploaded_by.toString());
    if (data.unit_names?.length)
        formData.append("unit_names", data.unit_names.join(","));

    const response = await ocrApi.post<ExtractionResponse>(
        "/v1/invoices/upload",
        formData,
        {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        },
    );
    return response.data;
};

export const getInvoices = async (params?: {
    site_id?: number;
    category_id?: number;
    user_id?: number;
}) => {
    const response = await ocrApi.get<Invoice[]>("/v1/invoices", { params });
    return response.data;
};

export const getInvoiceById = async (id: number) => {
    const response = await ocrApi.get<Invoice>(`/v1/invoices/${id}`);
    return response.data;
};

export const deleteInvoice = async (id: number) => {
    const response = await ocrApi.delete<{
        message: string;
        invoice_id: number;
    }>(`/v1/invoices/${id}`);
    return response.data;
};

export const bulkDeleteInvoices = async (ids: number[]) => {
    const response = await ocrApi.delete<{ message: string; deleted: number }>(
        "/v1/invoices/bulk",
        { data: { ids } },
    );
    return response.data;
};

export const extractInvoice = async (data: {
    file: File;
    category?: string;
}) => {
    const formData = new FormData();
    formData.append("file", data.file);
    if (data.category) formData.append("category", data.category);

    const response = await ocrApi.post<ExtractionResponse>(
        "/v1/extract",
        formData,
        {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        },
    );
    return response.data;
};

export const reextractInvoice = async (
    invoiceId: number,
    params?: { site_id?: number; category_id?: number; unit_names?: string[] },
): Promise<ExtractionResponse> => {
    const formData = new FormData();
    formData.append("invoice_id", String(invoiceId));
    if (params?.site_id != null)
        formData.append("site_id", String(params.site_id));
    if (params?.category_id != null)
        formData.append("category_id", String(params.category_id));
    if (params?.unit_names?.length)
        formData.append("unit_names", params.unit_names.join(","));
    const response = await ocrApi.post<ExtractionResponse>(
        "/v1/extract",
        formData,
    );
    return response.data;
};

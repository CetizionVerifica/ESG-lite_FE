import api from "../api/axios";

export interface MasterData {
    id: number;
    code: string;
    title: string;
    description?: string;
    uom?: string;
    type: string;
    level: number;
    kpi_field_placeholder?: string;
    status: string;
    sequence: number;
    parent_id?: number;
    parent?: MasterData;
}

export const getMasterData = async () => {
    const response = await api.get("/admin/master-data");
    return response.data;
};

export const createMasterData = async (data: Partial<MasterData>) => {
    const response = await api.post("/admin/master-data", data);
    return response.data;
};

export const updateMasterData = async (
    id: number,
    data: Partial<MasterData>
) => {
    const response = await api.put(`/admin/master-data/${id}`, data);
    return response.data;
};

export const deleteMasterData = async (id: number) => {
    const response = await api.delete(`/admin/master-data/${id}`);
    return response.data;
};

export const seedMasterData = async () => {
    const response = await api.post("/admin/master-data/seed", {});
    return response.data;
};

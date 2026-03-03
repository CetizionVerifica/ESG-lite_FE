import api from "../api/axios";

export interface UnitMaster {
    id: number;
    name: string;
    shortName: string;
    status: "Active" | "Inactive";
}

export const getUnitMasters = async (): Promise<UnitMaster[]> => {
    const response = await api.get("/admin/unit-master");
    return response.data;
};

export const createUnitMaster = async (data: Omit<UnitMaster, "id">): Promise<UnitMaster> => {
    const response = await api.post("/admin/unit-master", data);
    return response.data;
};

export const updateUnitMaster = async (id: number, data: Partial<UnitMaster>): Promise<UnitMaster> => {
    const response = await api.put(`/admin/unit-master/${id}`, data);
    return response.data;
};

export const deleteUnitMaster = async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/admin/unit-master/${id}`);
    return response.data;
};

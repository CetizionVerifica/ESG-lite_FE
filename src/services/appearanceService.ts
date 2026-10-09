import api from "../api/axios";
import type { Appearance } from "../theme/packs";

// The signed-in user's saved colour scheme (ESG-lite B2).
export const getMyAppearance = async (): Promise<{ appearance: Appearance }> => {
  const res = await api.get("/auth/me/appearance");
  return res.data;
};

export const saveMyAppearance = async (appearance: Appearance): Promise<{ appearance: Appearance }> => {
  const res = await api.put("/auth/me/appearance", { appearance });
  return res.data;
};

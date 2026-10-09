import api from "../api/axios";

export interface Brand {
  companyId: number;
  name: string;
  primary: string;
  accent: string;
  coverFrom: string;
  coverTo: string;
  logoUrl: string | null;
  logoPublicId: string | null;
}

// Current brand kit for a company (falls back to company name + defaults if unset).
export const getBrand = async (companyId: number): Promise<Brand> => {
  const res = await api.get(`/brands/${companyId}`);
  return res.data;
};

// Brand kit of the signed-in user's own company (any role; ESG-lite B1).
// Returns defaults when the company has no brand row; 404 for Superadmin.
export interface MyBrand extends Omit<Brand, "logoPublicId"> {
  logoOnDarkUrl: string | null;
  defaultLook: "classic" | "light" | "night";
  scope3Colour: string | null;
}

export const getMyBrand = async (): Promise<MyBrand> => {
  const res = await api.get("/brands/mine");
  return res.data;
};

// Upsert name + colors (hex validated server-side).
export const saveBrand = async (
  companyId: number,
  data: Partial<Pick<Brand, "name" | "primary" | "accent" | "coverFrom" | "coverTo">>
) => {
  const res = await api.put(`/brands/${companyId}`, data);
  return res.data;
};

// Upload a logo image → stored on R2, returns the updated brand.
export const uploadBrandLogo = async (companyId: number, file: File) => {
  const form = new FormData();
  form.append("logo", file);
  const res = await api.post(`/brands/${companyId}/logo`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

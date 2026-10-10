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
  /** B1: logo for dark surfaces (Classic top bar, Night). */
  logoOnDarkUrl?: string | null;
  /** B1: the client's default look. */
  defaultLook?: "classic" | "light" | "night";
  /** B1: optional Scope 3 chart colour; null = derived. */
  scope3Colour?: string | null;
  /** The client's colour-guideline file (PDF or image) and its original name. */
  guidelineUrl?: string | null;
  guidelineName?: string | null;
  /** ISO time of the last save (absent for a company without a brand row). */
  updatedAt?: string;
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

/** Fields PUT /brands/:companyId accepts; logoOnDarkUrl / guidelineUrl may only be null (removes that file). */
export type BrandUpdate = Partial<
  Pick<Brand, "name" | "primary" | "accent" | "coverFrom" | "coverTo" | "defaultLook" | "scope3Colour">
> & { logoOnDarkUrl?: null; guidelineUrl?: null };

// Upsert name + colors (hex validated server-side).
export const saveBrand = async (companyId: number, data: BrandUpdate) => {
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

// Upload the logo for dark surfaces → stored on R2 as logoOnDarkUrl (B1).
export const uploadBrandDarkLogo = async (companyId: number, file: File) => {
  const form = new FormData();
  form.append("logo", file);
  const res = await api.post(`/brands/${companyId}/logo-dark`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

// Upload the client's colour-guideline file (PDF or image) → stored on R2 as guidelineUrl.
export const uploadBrandGuideline = async (companyId: number, file: File) => {
  const form = new FormData();
  form.append("guideline", file);
  const res = await api.post(`/brands/${companyId}/guideline`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

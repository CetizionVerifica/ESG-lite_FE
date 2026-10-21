// PRO-0 · PE-2 custom brand fonts (decision E3: Managers and the Superadmin upload and delete):
//   GET    /studio/brand-kit/fonts                    → {fonts, canEdit}
//   POST   /studio/brand-kit/fonts (multipart)        file + family, weight, style, licenceConfirmed → 201 BrandFont
//   DELETE /studio/brand-kit/fonts/:id                → 204 (the UI confirms inline first)
//   GET    /studio/brand-kit/fonts/:id/files/:fileId  the bytes (BrandFontFile.url, for @font-face)
// In a doc a font is `custom:<id>` (text props `font`).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../api/axios";
import type { BrandFont, BrandFontsResponse, DsErrorCode, FontUploadFields } from "../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { brandKitKeys } from "./api";

const params = (companyId: number | null) => (companyId ? { company_id: companyId } : {});

export async function getBrandFonts(companyId: number | null): Promise<BrandFontsResponse> {
  const { data } = await api.get<BrandFontsResponse>("/studio/brand-kit/fonts", { params: params(companyId) });
  return data;
}
export async function uploadBrandFont(file: File, fields: FontUploadFields, companyId: number | null): Promise<BrandFont> {
  const form = new FormData();
  form.append("file", file);
  form.append("family", fields.family);
  if (fields.weight !== undefined) form.append("weight", String(fields.weight));
  if (fields.style) form.append("style", fields.style);
  form.append("licenceConfirmed", fields.licenceConfirmed ? "true" : "false");
  if (companyId) form.append("company_id", String(companyId));
  const { data } = await api.post<BrandFont>("/studio/brand-kit/fonts", form, { params: params(companyId) });
  return data;
}
export async function deleteBrandFont(id: number, companyId: number | null): Promise<void> {
  // data-loss-reviewed: removes one uploaded brand font family after the user confirms inline (PE-2); finals keep their embedded PDFs.
  await api.delete(`/studio/brand-kit/fonts/${id}`, { params: params(companyId) });
}

export const brandFontKeys = { list: (companyId: number | null) => ["studio", "brand-kit", "fonts", companyId] as const };

export function useBrandFonts() {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: brandFontKeys.list(companyId), queryFn: () => getBrandFonts(companyId), staleTime: 60_000 });
}

export function useBrandFontMutations() {
  const qc = useQueryClient();
  const companyId = useStudioCompanyId();
  const settle = async () => {
    await qc.invalidateQueries({ queryKey: brandFontKeys.list(companyId) });
    await qc.invalidateQueries({ queryKey: brandKitKeys.kit(companyId) });
  };
  const upload = useMutation({ mutationFn: ({ file, fields }: { file: File; fields: FontUploadFields }) => uploadBrandFont(file, fields, companyId), onSuccess: settle });
  const remove = useMutation({ mutationFn: (id: number) => deleteBrandFont(id, companyId), onSuccess: settle });
  return { upload, remove };
}

const MESSAGES: Partial<Record<DsErrorCode, string>> = {
  DS_ROLE: "Only Managers can add or remove brand fonts.",
  DS_FONT_TYPE: "Upload a WOFF2, TTF or OTF font.",
  DS_FONT_TOO_LARGE: "Fonts can be up to 5 MB.",
  DS_FONT_LICENCE: "Tick the box to confirm your company holds a licence to embed this font in PDFs.",
  DS_FONT_EXISTS: "This font family already has that weight and style.",
  DS_NOT_BUILT: "Font upload isn't available yet.",
};
export function brandFontErrorMessage(e: unknown, fallback = "The font couldn't be saved. Try again."): string {
  const code = (e as { response?: { data?: { code?: DsErrorCode } } })?.response?.data?.code;
  return (code && MESSAGES[code]) || fallback;
}

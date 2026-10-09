import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../api/axios";
import {
  getBrand,
  getMyBrand,
  saveBrand,
  uploadBrandDarkLogo,
  uploadBrandLogo,
} from "../../services/brandService";
import { type BrandDraft, type SavedBrand, toUpdate } from "./logic";

export const brandKey = (companyId: number) => ["brand-theme", companyId] as const;

/** Superadmin: any client's brand (GET /brands/:companyId). */
export function useClientBrand(companyId: number | null) {
  return useQuery({
    queryKey: brandKey(companyId ?? 0),
    queryFn: async (): Promise<SavedBrand> => getBrand(companyId as number),
    enabled: companyId !== null,
  });
}

/** Company Admin: their own company's brand, read only (GET /brands/mine). */
export function useOwnBrand(enabled: boolean) {
  return useQuery({
    queryKey: ["brand-theme", "mine"],
    queryFn: async (): Promise<SavedBrand> => getMyBrand(),
    enabled,
  });
}

/** Which part of a save failed, so the page can say what was and wasn't saved. */
export class SaveError extends Error {
  constructor(
    message: string,
    /** Which staged logos did reach the server, so only those are cleared. */
    readonly saved: { logo: boolean; darkLogo: boolean },
  ) {
    super(message);
  }
}

function serverMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

/**
 * One save model: staged logos upload first, then the colours. If an upload
 * fails nothing else is sent; if the colours fail after the logos went up,
 * the error says so.
 */
export function useSaveBrand(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: BrandDraft) => {
      const saved = { logo: false, darkLogo: false };
      try {
        if (draft.logoFile) {
          await uploadBrandLogo(companyId, draft.logoFile);
          saved.logo = true;
        }
        if (draft.darkLogoFile) {
          await uploadBrandDarkLogo(companyId, draft.darkLogoFile);
          saved.darkLogo = true;
        }
      } catch (e) {
        const what = draft.logoFile && !saved.logo ? "The logo" : "The dark-background logo";
        const rest = saved.logo ? " The light-background logo was saved; the colours were not." : " Nothing was saved.";
        throw new SaveError(`${serverMessage(e, `${what} couldn't be uploaded.`)}${rest}`, saved);
      }
      try {
        await saveBrand(companyId, toUpdate(draft));
      } catch (e) {
        const msg = serverMessage(e, "The theme couldn't be saved.");
        const anyLogo = saved.logo || saved.darkLogo;
        throw new SaveError(anyLogo ? `${msg} The new logo was saved; the colours were not.` : msg, saved);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: brandKey(companyId) });
      // The app theme (ThemeProvider) re-reads its brand too.
      await queryClient.invalidateQueries({ queryKey: ["brand"] });
    },
  });
}

/** The branded GHG PDF as the backend renders it from the saved Brand row. */
export async function fetchReportPdf(companyId: number, year: number): Promise<Blob> {
  const res = await api.get(`/reports/ghg/${companyId}`, { params: { year }, responseType: "blob" });
  return res.data as Blob;
}

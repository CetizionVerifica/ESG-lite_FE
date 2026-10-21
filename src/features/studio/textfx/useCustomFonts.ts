// PE-2 · the company's uploaded brand fonts in the editor: hands them to every
// sheet mount (renderHost `setStudioCustomFonts`) and loads their files into
// document.fonts with the session's token, so `custom:<id>` boxes draw in the
// uploaded face exactly as the server's PDF embeds it.
import { useEffect, useMemo } from "react";
import api from "../../../api/axios";
import { ensureCustomFonts, setStudioCustomFonts } from "../../../lib/studio/renderHost";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { useBrandFonts } from "../brand-kit/fontsApi";
import { renderCustomFonts } from "./logic";

export function useCustomFonts(): void {
  const fonts = useBrandFonts();
  const companyId = useStudioCompanyId();
  const list = useMemo(() => renderCustomFonts(fonts.data?.fonts ?? []), [fonts.data]);
  useEffect(() => {
    if (!fonts.data) return;
    setStudioCustomFonts(list);
    void ensureCustomFonts(list, async (url) => (await api.get<ArrayBuffer>(url, { responseType: "arraybuffer", params: companyId ? { company_id: companyId } : {} })).data);
  }, [fonts.data, list, companyId]);
}

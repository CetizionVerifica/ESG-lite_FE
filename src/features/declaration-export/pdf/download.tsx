import { pdf } from "@react-pdf/renderer";
import type { ThemePack } from "../../../theme";
import { pdfTheme } from "../../../theme";
import type { Declaration } from "../../../services/pcfExportService";
import { saveBlob } from "../logic";
import { DeclarationPdf } from "./DeclarationPdf";

/** The logo as a data URL; react-pdf can't send credentials and a CORS failure would break the whole PDF. */
async function logoDataUrl(url: string | null | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    if (!/^image\/(png|jpe?g)$/.test(blob.type)) return undefined;
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : undefined);
      r.onerror = () => resolve(undefined);
      r.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/** Builds the branded declaration PDF in the signed-in company's brand and saves it. */
export async function downloadDeclarationPdf(declaration: Declaration, pack: ThemePack, fileName: string): Promise<void> {
  const theme = pdfTheme(pack);
  const logo = await logoDataUrl(theme.logoUrl);
  const blob = await pdf(<DeclarationPdf theme={theme} logo={logo} declaration={declaration} />).toBlob();
  saveBlob(blob, fileName);
}

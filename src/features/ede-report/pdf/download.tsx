import { pdf } from "@react-pdf/renderer";
import type { ThemePack } from "../../../theme";
import { pdfTheme } from "../../../theme";
import { getBrand } from "../api";
import type { EdeReportResponse } from "../../../services/reportService";
import type { ReportPeriod } from "../../../ui";
import { edeFigures, pdfFileName, reportSites, siteColorIndex } from "../logic";
import { renderCharts } from "./charts";
import { EdePdf } from "./EdePdf";

export type EdePdfRequest = {
  data: EdeReportResponse;
  period: ReportPeriod;
  company: string | undefined;
  sitesText: string;
  categoriesText: string;
  /** The signed-in company's pack (Manager), or the client to fetch the brand for (Superadmin). */
  brand: { pack: ThemePack } | { clientId: number };
};

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

/** Builds the branded PDF and saves it as EDE_Report_{company}_{period}.pdf. */
export async function downloadEdePdf(req: EdePdfRequest): Promise<void> {
  const theme = "pack" in req.brand ? pdfTheme(req.brand.pack) : pdfTheme(await getBrand(req.brand.clientId).catch(() => null));
  const sites = reportSites(req.data);
  const colorIndex = siteColorIndex(sites);
  const company = req.company || theme.name;
  const [logo, charts] = await Promise.all([logoDataUrl(theme.logoUrl), Promise.resolve(renderCharts(req.data, req.period, sites, colorIndex, theme))]);

  const blob = await pdf(
    <EdePdf
      theme={theme}
      logo={logo}
      company={company}
      period={req.period}
      sitesText={req.sitesText}
      categoriesText={req.categoriesText}
      data={req.data}
      figures={edeFigures(req.data)}
      sites={sites}
      charts={charts}
      generatedAt={new Date()}
    />,
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdfFileName(company, req.period);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

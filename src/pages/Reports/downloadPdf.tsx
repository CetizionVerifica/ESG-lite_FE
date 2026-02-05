import { pdf } from "@react-pdf/renderer";
import { toPng } from "html-to-image";
import ReportPdf, { ReportPdfImages, ReportPdfProps } from "./ReportPdf";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function captureNodeAsPng(node: HTMLElement): Promise<string> {
  return await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
}

export type ReportPdfImagesKeys = keyof ReportPdfImages;
export type ChartRefs = Partial<Record<ReportPdfImagesKeys, HTMLElement | null>>;

export async function downloadEdeReportPdf(
  reportProps: Omit<ReportPdfProps, "images">,
  chartRefs: ChartRefs,
  fileName = "EDE_Report.pdf"
) {
  await sleep(300);

  const images: ReportPdfImages = {};
  const keys = Object.keys(chartRefs) as ReportPdfImagesKeys[];

  for (const key of keys) {
    const node = chartRefs[key];
    if (!node) continue;

    try {
      images[key] = await captureNodeAsPng(node);
    } catch (err) {
      //console.error(`Chart capture failed for ${key}:`, err);
    }
  }

  const doc = <ReportPdf {...reportProps} images={images} />;
  const blob = await pdf(doc).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

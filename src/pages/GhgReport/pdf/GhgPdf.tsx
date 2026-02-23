import React, { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { pdf } from "@react-pdf/renderer";
import type { GhgReportTablesResponse, GhgReportDetailsResponse } from "../../../services/ghgreportService";
import { getCompanyNameBySites } from "../../../services/companyService";
import { GhgPdfHiddenCharts, type GhgPdfChartRefs } from "./GhgPdfHiddenCharts";
import { buildGhgPdfDocument, type GhgPdfChartImages, type TocMap, type TocKey } from "./GhgPdfDocument";

import * as pdfjsLib from "pdfjs-dist";

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
} catch {
}

export default function GhgPdfExport({
  siteIds,
  tablesData,
  detailsData,
}: {
  siteIds: number[];
  tablesData: GhgReportTablesResponse | null;
  detailsData: GhgReportDetailsResponse | null;
}) {
  const [companyName, setCompanyName] = useState<string>("Company");
  const [isGenerating, setIsGenerating] = useState(false);

  const scopeComparisonRef = useRef<HTMLDivElement>(null);
  const categoryAbsRef = useRef<HTMLDivElement>(null);
  const scope1Ref = useRef<HTMLDivElement>(null);
  const scope2Ref = useRef<HTMLDivElement>(null);
  const scope3Ref = useRef<HTMLDivElement>(null);
  const resultsPctRef = useRef<HTMLDivElement>(null);

  const refs: GhgPdfChartRefs = useMemo(
    () => ({
      scopeComparisonRef,
      categoryAbsRef,
      scope1Ref,
      scope2Ref,
      scope3Ref,
      resultsPctRef,
    }),
    []
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!siteIds?.length) return;
        const cd: any = await getCompanyNameBySites(siteIds);
        const name =
          cd?.companyName ||
          cd?.name ||
          cd?.company?.companyName ||
          cd?.company?.name ||
          cd?.data?.companyName ||
          cd?.data?.name ||
          "Company";
        if (alive) setCompanyName(String(name));
      } catch {
        if (alive) setCompanyName("Company");
      }
    })();
    return () => {
      alive = false;
    };
  }, [siteIds]);

  const canGenerate = !!tablesData && !!detailsData;

  async function waitForPaint() {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 140));
  }

  async function capture(ref: React.RefObject<HTMLDivElement | null>, pixelRatio = 2) {
    if (!ref.current) return "";
    return toPng(ref.current, {
      pixelRatio,
      cacheBust: true,
      backgroundColor: "#ffffff",
    });
  }

  async function extractTocMapFromBlob(blob: Blob): Promise<TocMap> {
    const ab = await blob.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: ab }).promise;

    const TOC_PAGE = 2;

    const sectionMarkers: Array<{ text: string; key: TocKey }> = [
      { text: "This report presents greenhouse gas", key: "INTRO" },
      { text: "This Executive Summary presents a high-level", key: "EXEC" },
      { text: "Overview of emissions for all locations", key: "OVERVIEW" },
      { text: "Carbon Accounting Objectives", key: "DETAILED" },
      { text: "RESULTS", key: "RESULTS" },
      { text: "This report provides a structured view", key: "CONCLUSION" },
    ];

    const tocMap: TocMap = {};

    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      if (pageNo === TOC_PAGE) continue;

      const page = await doc.getPage(pageNo);
      const textContent = await page.getTextContent();
      const pageText = (textContent.items as any[])
        .map((it: any) => String(it.str || ""))
        .join(" ");

      for (const { text, key } of sectionMarkers) {
        if (tocMap[key]) continue;
        if (pageText.includes(text)) {
          tocMap[key] = pageNo;
        }
      }
    }

    return tocMap;
  }

  async function onDownload() {
    if (!tablesData || !detailsData) return;

    try {
      setIsGenerating(true);
      await waitForPaint();

      const images: GhgPdfChartImages = {
        scopeComparison: await capture(scopeComparisonRef, 2),
        categoryAbs: await capture(categoryAbsRef, 2),
        scope1Pct: await capture(scope1Ref, 2),
        scope2Pct: await capture(scope2Ref, 2),
        scope3Pct: await capture(scope3Ref, 2),
        resultsPct: await capture(resultsPctRef, 2),
      };

      const draftDoc = buildGhgPdfDocument({
        companyName,
        tablesData,
        detailsData,
        images,
        tocMap: undefined,
      });

      const draftBlob = await pdf(draftDoc).toBlob();

      const tocMap = await extractTocMapFromBlob(draftBlob);

      const finalDoc = buildGhgPdfDocument({
        companyName,
        tablesData,
        detailsData,
        images,
        tocMap,
      });

      const finalBlob = await pdf(finalDoc).toBlob();

      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GHG_Report_${companyName}_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsGenerating(false);
    }
  }

  if (!canGenerate) {
    return (
      <button
        className="h-10 px-4 rounded text-white bg-gray-400 cursor-not-allowed"
        disabled
        title="Load report data to enable PDF"
      >
        Download PDF
      </button>
    );
  }

  return (
    <>
      <button
        className={`h-10 px-4 rounded text-white ${
          isGenerating ? "bg-gray-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
        }`}
        disabled={isGenerating}
        onClick={onDownload}
      >
        {isGenerating ? "Preparing PDF..." : "Download PDF"}
      </button>

      <GhgPdfHiddenCharts tablesData={tablesData} detailsData={detailsData} refs={refs} />
    </>
  );
}

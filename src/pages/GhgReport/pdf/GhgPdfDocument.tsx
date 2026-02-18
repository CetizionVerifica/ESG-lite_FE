
import { Document } from "@react-pdf/renderer";
import type { GhgReportTablesResponse, GhgReportDetailsResponse } from "../../../services/ghgreportService";
import { formatPeriodLabel, num, r2, EXCLUDED_CATEGORIES } from "./PdfShared";

import PdfCover from "./sections/PdfCover";
import PdfIntroduction from "./sections/PdfIntroduction";
import PdfExecutiveSummary from "./sections/PdfExecutiveSummary";
import PdfOverviewAllLocations from "./sections/PdfOverviewAllLocation";
import PdfDetailedEmissions from "./sections/PdfDetailedEmissions";
import PdfResultsConclusion from "./sections/PdfResultsConclusion";

function buildCategoryPctModel(detailsData: GhgReportDetailsResponse) {
  const rows = (detailsData.rows || []).filter(
    (r: any) => !EXCLUDED_CATEGORIES.includes(String(r.categoryName || ""))
  );

  const selectedByCat = new Map<string, number>();
  const compareByCat = new Map<string, number>();

  for (const r of rows as any[]) {
    const cat = String((r as any).categoryName || "");
    if (!cat) continue;
    selectedByCat.set(cat, (selectedByCat.get(cat) || 0) + r2(num((r as any).selected?.emissions)));
    compareByCat.set(cat, (compareByCat.get(cat) || 0) + r2(num((r as any).compare?.emissions)));
  }

  const categories = Array.from(new Set([...selectedByCat.keys(), ...compareByCat.keys()]))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const compareTotal = Array.from(compareByCat.values()).reduce((a, b) => a + b, 0);
  const selectedTotal = Array.from(selectedByCat.values()).reduce((a, b) => a + b, 0);

  const comparePct = categories.map((c) => {
    const v = compareByCat.get(c) || 0;
    return compareTotal > 0 && v > 0 ? r2((v / compareTotal) * 100) : 0;
  });

  const selectedPct = categories.map((c) => {
    const v = selectedByCat.get(c) || 0;
    return selectedTotal > 0 && v > 0 ? r2((v / selectedTotal) * 100) : 0;
  });

  const topSelectedIdx = selectedPct.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v)[0]?.i;
  const topCompareIdx = comparePct.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v)[0]?.i;

  return {
    topSelectedCategory: topSelectedIdx != null ? categories[topSelectedIdx] : "",
    topSelectedPct: topSelectedIdx != null ? selectedPct[topSelectedIdx] : 0,
    topCompareCategory: topCompareIdx != null ? categories[topCompareIdx] : "",
    topComparePct: topCompareIdx != null ? comparePct[topCompareIdx] : 0,
  };
}

export type GhgPdfChartImages = {
  scopeComparison: string;
  categoryAbs: string;
  scope1Pct: string;
  scope2Pct: string;
  scope3Pct: string;
  resultsPct: string;
};

export function buildGhgPdfDocument(args: {
  companyName: string;
  tablesData: GhgReportTablesResponse;
  detailsData: GhgReportDetailsResponse;
  images: GhgPdfChartImages;
}) {
  const { companyName, tablesData, detailsData, images } = args;

  const compareYear = tablesData.filters.compareYear;
  const selectedYear = tablesData.filters.year;

  const compareLabel = formatPeriodLabel(tablesData.filters.yearType, compareYear, tablesData.ranges);
  const selectedLabel = formatPeriodLabel(tablesData.filters.yearType, selectedYear, tablesData.ranges);

  const compareName = compareLabel.split(" (")[0];
  const selectedName = selectedLabel.split(" (")[0];

  const model = buildCategoryPctModel(detailsData);

  const reportingLine =
    tablesData.filters.yearType === "FY"
      ? `Reporting Period: FY ${compareYear} – FY ${selectedYear}`
      : `Reporting Period: ${compareYear} – ${selectedYear}`;

  const publishedLine = `Date published: ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}`;

  return (
    <Document>
      <PdfCover companyName={companyName} reportingLine={reportingLine} publishedLine={publishedLine} />
      <PdfIntroduction companyName={companyName} compareLabel={compareLabel} selectedLabel={selectedLabel} />
      <PdfExecutiveSummary
        companyName={companyName}
        tablesData={tablesData}
        compareLabel={compareLabel}
        selectedLabel={selectedLabel}
        imgScopeComparison={images.scopeComparison}
        imgCategoryAbs={images.categoryAbs}
      />
      <PdfOverviewAllLocations companyName={companyName} tablesData={tablesData} compareLabel={compareLabel} selectedLabel={selectedLabel} />
      <PdfDetailedEmissions
        companyName={companyName}
        detailsData={detailsData}
        compareLabel={compareLabel}
        selectedLabel={selectedLabel}
        compareYear={compareYear}
        selectedYear={selectedYear}
        imgScope1Pct={images.scope1Pct}
        imgScope2Pct={images.scope2Pct}
        imgScope3Pct={images.scope3Pct}
      />
      <PdfResultsConclusion
        companyName={companyName}
        compareName={compareName}
        selectedName={selectedName}
        imgResultsPct={images.resultsPct}
        topSelectedCategory={model.topSelectedCategory}
        topSelectedPct={model.topSelectedPct}
        topCompareCategory={model.topCompareCategory}
        topComparePct={model.topComparePct}
      />
    </Document>
  );
}

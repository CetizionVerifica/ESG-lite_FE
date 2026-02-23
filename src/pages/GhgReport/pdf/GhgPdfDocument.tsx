import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { GhgReportTablesResponse, GhgReportDetailsResponse } from "../../../services/ghgreportService";
import { formatPeriodLabel, num, r2, EXCLUDED_CATEGORIES, pdfStyles as s } from "./PdfShared";

import PdfCover from "./sections/PdfCover";
import PdfIntroduction from "./sections/PdfIntroduction";
import PdfExecutiveSummary from "./sections/PdfExecutiveSummary";
import PdfOverviewAllLocations from "./sections/PdfOverviewAllLocation";
import PdfDetailedEmissions from "./sections/PdfDetailedEmissions";
import PdfResultsConclusion from "./sections/PdfResultsConclusion";

export type TocKey = "INTRO" | "EXEC" | "OVERVIEW" | "DETAILED" | "RESULTS" | "CONCLUSION";
export type SubKey =
  | "INTRO_SCOPE_DEF"
  | "INTRO_NOTES"
  | "EXEC_SCOPE"
  | "EXEC_CATEGORY"
  | "OVERVIEW_SCOPE1"
  | "OVERVIEW_SCOPE2"
  | "OVERVIEW_SCOPE3"
  | "DETAILED_OBJECTIVES"
  | "DETAILED_SCOPE1"
  | "DETAILED_SCOPE1_DIST"
  | "DETAILED_SCOPE2"
  | "DETAILED_SCOPE2_DIST"
  | "DETAILED_SCOPE3"
  | "DETAILED_SCOPE3_DIST"
  | "RESULTS_CATEGORY"
  | "RESULTS_FINDINGS"
  | "CONCLUSION_ACTIONS";

export type TocMap = Partial<Record<TocKey, number>>;
export type SubMap = Partial<Record<SubKey, number>>;

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

function buildTocSections() {
  


  return [
    {
      key: "INTRO" as TocKey,
      title: "Introduction",
      subheadings: [
        { subKey: "INTRO_SCOPE_DEF" as SubKey, label: "Scope Definitions" },
        { subKey: "INTRO_NOTES" as SubKey, label: "Notes on Data and Assumptions" },
      ],
    },
    {
      key: "EXEC" as TocKey,
      title: "Executive Summary",
      subheadings: [
        { subKey: "EXEC_SCOPE" as SubKey, label: "Emissions by Scope" },
        { subKey: "EXEC_CATEGORY" as SubKey, label: "Emissions by Category" },
      ],
    },
    {
  key: "OVERVIEW" as TocKey,
  title: "Overview — All Locations",
  subheadings: [
    { subKey: "OVERVIEW_SCOPE1" as SubKey, label: "All Locations Summary" },
  ],
},
    {
      key: "DETAILED" as TocKey,
      title: "Detailed Emissions",
      subheadings: [
        { subKey: "DETAILED_OBJECTIVES" as SubKey, label: "Carbon Accounting Objectives" },
        { subKey: "DETAILED_SCOPE1" as SubKey, label: "Scope 1 — Direct GHG Emissions" },
        { subKey: "DETAILED_SCOPE1_DIST" as SubKey, label: "Scope 1 Category Distribution" },
        { subKey: "DETAILED_SCOPE2" as SubKey, label: "Scope 2 — Indirect GHG Emissions" },
        { subKey: "DETAILED_SCOPE2_DIST" as SubKey, label: "Scope 2 Category Distribution" },
        { subKey: "DETAILED_SCOPE3" as SubKey, label: "Scope 3 — Indirect GHG Emissions" },
        { subKey: "DETAILED_SCOPE3_DIST" as SubKey, label: "Scope 3 Category Distribution" },
      ],
    },
    {
      key: "RESULTS" as TocKey,
      title: "Results",
      subheadings: [
        { subKey: "RESULTS_CATEGORY" as SubKey, label: "Category Contribution to Total Emissions" },
        { subKey: "RESULTS_FINDINGS" as SubKey, label: "Key Findings" },
      ],
    },
    {
      key: "CONCLUSION" as TocKey,
      title: "Conclusion",
      subheadings: [
        { subKey: "CONCLUSION_ACTIONS" as SubKey, label: "Recommended Actions" },
      ],
    },
  ];
}

function PdfTableOfContents({
  companyName,
  reportingLine,
  publishedLine,
  tocMap,
  subMap,
}: {
  companyName: string;
  reportingLine: string;
  publishedLine: string;
  tocMap?: TocMap;
  subMap?: SubMap;
  compareLabel: string;
  selectedLabel: string;
}) {
  const sections = buildTocSections();
  const pageNo = (n?: number) => (n ? String(n) : "—");

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Table of Contents</Text>

      <View style={s.card}>
        <Text style={s.p}>{companyName}</Text>
        <Text style={s.p}>{reportingLine}</Text>
        <Text style={s.p}>{publishedLine}</Text>
      </View>

      <View style={[s.cardTight, { marginTop: 12 }]}>
        {sections.map((section, idx) => (
          <View
            key={section.key}
            style={{
              borderBottomWidth: idx < sections.length - 1 ? 1 : 0,
              borderBottomColor: "#E6E8EC",
              paddingVertical: 8,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={[s.p, { fontWeight: 700, color: "#0f172a" }]}>{section.title}</Text>
              <Text style={[s.p, { fontWeight: 700, color: "#0f172a" }]}>{pageNo(tocMap?.[section.key])}</Text>
            </View>

            {section.subheadings.map((sub) => (
              <View
                key={sub.subKey}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginTop: 3,
                  paddingLeft: 14,
                }}
              >
                <Text style={[s.p, { color: "#4b5563", fontSize: 9 }]}>— {sub.label}</Text>
                <Text style={[s.p, { color: "#4b5563", fontSize: 9 }]}>{pageNo(subMap?.[sub.subKey])}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={s.footer}>
        <Text style={s.footText}>{companyName}</Text>
        <Text
          style={s.footText}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </Page>
  );
}

export function buildGhgPdfDocument(args: {
  companyName: string;
  tablesData: GhgReportTablesResponse;
  detailsData: GhgReportDetailsResponse;
  images: GhgPdfChartImages;
  tocMap?: TocMap;
  subMap?: SubMap;
}) {
  const { companyName, tablesData, detailsData, images, tocMap, subMap } = args;

  const compareYear = tablesData.filters.compareYear;
  const selectedYear = tablesData.filters.year;
  const compareLabel = formatPeriodLabel(tablesData.filters.yearType, compareYear);
  const selectedLabel = formatPeriodLabel(tablesData.filters.yearType, selectedYear);
  const compareName = compareLabel.split(" (")[0];
  const selectedName = selectedLabel.split(" (")[0];
  const model = buildCategoryPctModel(detailsData);

  const reportingLine =
    tablesData.filters.yearType === "FY"
      ? `Reporting Period: FY ${compareYear} – FY ${selectedYear}`
      : `Reporting Period: ${compareYear} – ${selectedYear}`;

  const publishedLine = `Date published: ${new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  })}`;

  return (
    <Document>
      <PdfCover
        companyName={companyName}
        reportingLine={reportingLine}
        publishedLine={publishedLine}
      />

      <PdfTableOfContents
        companyName={companyName}
        reportingLine={reportingLine}
        publishedLine={publishedLine}
        tocMap={tocMap}
        subMap={subMap}
        compareLabel={compareLabel}
        selectedLabel={selectedLabel}
      />

      <PdfIntroduction
        companyName={companyName}
        compareLabel={compareLabel}
        selectedLabel={selectedLabel}
      />

      <PdfExecutiveSummary
        companyName={companyName}
        tablesData={tablesData}
        compareLabel={compareLabel}
        selectedLabel={selectedLabel}
        imgScopeComparison={images.scopeComparison}
        imgCategoryAbs={images.categoryAbs}
      />

      <PdfOverviewAllLocations
        companyName={companyName}
        tablesData={tablesData}
        compareLabel={compareLabel}
        selectedLabel={selectedLabel}
      />

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
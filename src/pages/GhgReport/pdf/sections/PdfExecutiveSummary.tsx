
// import { Image, Page, Text, View } from "@react-pdf/renderer";
// import type { GhgReportTablesResponse } from "../../../../services/ghgreportService";
// import { fmt, fmtPct, num, pdfStyles as s } from "../PdfShared";

// function PdfTable1({
//   tablesData,
//   compareLabel,
//   selectedLabel,
// }: {
//   tablesData: GhgReportTablesResponse;
//   compareLabel: string;
//   selectedLabel: string;
// }) {
//   const compareYear = tablesData.filters.compareYear;
//   const selectedYear = tablesData.filters.year;
//   const rows: any[] = (tablesData.tables as any).table1_emissionsByScope_twoYears || [];
//   const scopes = rows.filter((r) => String(r.scope).toLowerCase().includes("scope"));
//   const totalRow = rows.find((r) => String(r.scope).toLowerCase().includes("total"));
//   const all = [...scopes, ...(totalRow ? [totalRow] : [])];

//   const colW = { scope: "22%", cTot: "20%", cPct: "14%", sTot: "20%", sPct: "14%" } as const;
//   const cell = (w: any, extra?: any) => [{ width: w }, extra].filter(Boolean);

//   return (
//     <View style={s.cardTight}>
//       <Text style={s.h3}>{`Table 1: Summary of GHG emissions by Scope for ${compareLabel} & ${selectedLabel}`}</Text>

//       <View style={s.table}>
//         <View style={s.trHead}>
//           <Text style={[s.th, ...cell(colW.scope), s.cellBorder]}>Scope</Text>
//           <Text style={[s.th, ...cell(colW.cTot), s.cellBorder, s.right]}>{`${compareYear} Total (tCO₂e)`}</Text>
//           <Text style={[s.th, ...cell(colW.cPct), s.cellBorder, s.right]}>{`${compareYear} % of Total`}</Text>
//           <Text style={[s.th, ...cell(colW.sTot), s.cellBorder, s.right]}>{`${selectedYear} Total (tCO₂e)`}</Text>
//           <Text style={[s.th, ...cell(colW.sPct), s.right]}>{`${selectedYear} % of Total`}</Text>
//         </View>

//         {all.map((r: any, idx: number) => {
//           const c = r.values?.[String(compareYear)] || {};
//           const s2 = r.values?.[String(selectedYear)] || {};
//           const isTotal = String(r.scope).toLowerCase().includes("total");
//           return (
//             <View key={`${r.scope}-${idx}`} style={idx === 0 ? s.tr : [s.tr, s.rowBorder]}>
//               <Text style={[s.td, ...cell(colW.scope), s.cellBorder, isTotal ? { fontWeight: 700 } : undefined]}>{String(r.scope)}</Text>
//               <Text style={[s.td, ...cell(colW.cTot), s.cellBorder, s.right, isTotal ? { fontWeight: 700 } : undefined]}>{fmt(num(c.emissions))}</Text>
//               <Text style={[s.td, ...cell(colW.cPct), s.cellBorder, s.right]}>{fmtPct(num(c.pctOfTotal))}</Text>
//               <Text style={[s.td, ...cell(colW.sTot), s.cellBorder, s.right, isTotal ? { fontWeight: 700 } : undefined]}>{fmt(num(s2.emissions))}</Text>
//               <Text style={[s.td, ...cell(colW.sPct), s.right]}>{fmtPct(num(s2.pctOfTotal))}</Text>
//             </View>
//           );
//         })}
//       </View>
//     </View>
//   );
// }

// export default function PdfExecutiveSummary({
//   companyName,
//   tablesData,
//   compareLabel,
//   selectedLabel,
//   imgScopeComparison,
//   imgCategoryAbs,
// }: {
//   companyName: string;
//   tablesData: GhgReportTablesResponse;
//   compareLabel: string;
//   selectedLabel: string;
//   imgScopeComparison: string;
//   imgCategoryAbs: string;
// }) {
//   return (
//     <Page size="A4" style={s.page}>
//       <Text style={s.h2}>Executive Summary</Text>

//       <View style={s.card}>
//         <Text style={s.p}>
//           This section summarizes emissions across the selected reporting periods and highlights how emissions are distributed by scope and
//           category. The intent is to support management review, identify material drivers, and enable year-over-year comparability.
//         </Text>
//       </View>

//       <PdfTable1 tablesData={tablesData} compareLabel={compareLabel} selectedLabel={selectedLabel} />

//       {imgScopeComparison ? (
//         <View style={[s.cardTight, s.fig]} wrap={false}>
//           <Image src={imgScopeComparison} style={{ width: "100%", height: 260 }} />
//           <Text style={s.figCap}>Figure 1: Emissions Comparison by Scope (YoY)</Text>
//         </View>
//       ) : null}

//       {imgCategoryAbs ? (
//         <View style={[s.cardTight, s.fig]} wrap={false}>
//           <Image src={imgCategoryAbs} style={{ width: "100%", height: 250 }} />
//           <Text style={s.figCap}>Figure 2: Emissions by Category (YoY Comparison)</Text>
//         </View>
//       ) : null}

//       <View style={s.footer} fixed>
//         <Text style={s.footText}>{companyName}</Text>
//         <Text style={s.footText}>Executive Summary</Text>
//       </View>
//     </Page>
//   );
// }


import { Image, Page, Text, View } from "@react-pdf/renderer";
import type { GhgReportTablesResponse } from "../../../../services/ghgreportService";
import { fmt, fmtPct, num, pdfStyles as s } from "../PdfShared";

function PdfTable1({
  tablesData,
  compareLabel,
  selectedLabel,
}: {
  tablesData: GhgReportTablesResponse;
  compareLabel: string;
  selectedLabel: string;
}) {
  const compareYear = tablesData.filters.compareYear;
  const selectedYear = tablesData.filters.year;

  const rows: any[] = (tablesData.tables as any).table1_emissionsByScope_twoYears || [];
  const scopes = rows.filter((r) => String(r.scope).toLowerCase().includes("scope"));
  const totalRow = rows.find((r) => String(r.scope).toLowerCase().includes("total"));
  const all = [...scopes, ...(totalRow ? [totalRow] : [])];

  const colW = { scope: "22%", cTot: "20%", cPct: "14%", sTot: "20%", sPct: "14%" } as const;
  const cell = (w: any, extra?: any) => [{ width: w }, extra].filter(Boolean);

  return (
    <View style={s.cardTight}>
      <Text style={s.h3}>{`Table 1: Summary of GHG emissions by Scope for ${compareLabel} & ${selectedLabel}`}</Text>

      <View style={s.table}>
        <View style={s.trHead}>
          <Text style={[s.th, ...cell(colW.scope), s.cellBorder]}>Scope</Text>
          <Text style={[s.th, ...cell(colW.cTot), s.cellBorder, s.right]}>{`${compareYear} Total (tCO₂e)`}</Text>
          <Text style={[s.th, ...cell(colW.cPct), s.cellBorder, s.right]}>{`${compareYear} % of Total`}</Text>
          <Text style={[s.th, ...cell(colW.sTot), s.cellBorder, s.right]}>{`${selectedYear} Total (tCO₂e)`}</Text>
          <Text style={[s.th, ...cell(colW.sPct), s.right]}>{`${selectedYear} % of Total`}</Text>
        </View>

        {all.map((r: any, idx: number) => {
          const c = r.values?.[String(compareYear)] || {};
          const s2 = r.values?.[String(selectedYear)] || {};
          const isTotal = String(r.scope).toLowerCase().includes("total");

          return (
            <View key={`${r.scope}-${idx}`} style={idx === 0 ? s.tr : [s.tr, s.rowBorder]}>
              <Text style={[s.td, ...cell(colW.scope), s.cellBorder, isTotal ? { fontWeight: 700 } : undefined]}>
                {String(r.scope)}
              </Text>
              <Text style={[s.td, ...cell(colW.cTot), s.cellBorder, s.right, isTotal ? { fontWeight: 700 } : undefined]}>
                {fmt(num(c.emissions))}
              </Text>
              <Text style={[s.td, ...cell(colW.cPct), s.cellBorder, s.right]}>{fmtPct(num(c.pctOfTotal))}</Text>
              <Text style={[s.td, ...cell(colW.sTot), s.cellBorder, s.right, isTotal ? { fontWeight: 700 } : undefined]}>
                {fmt(num(s2.emissions))}
              </Text>
              <Text style={[s.td, ...cell(colW.sPct), s.right]}>{fmtPct(num(s2.pctOfTotal))}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}


function buildCategoryInsights(tablesData: GhgReportTablesResponse, compareLabel: string, selectedLabel: string) {
  const compareYear = tablesData.filters.compareYear;
  const selectedYear = tablesData.filters.year;

  console.log(compareLabel)
  const t: any = tablesData.tables as any;

  // Try a few likely keys. Keep it defensive.
  const rows: any[] =
    t.table2_emissionsByCategory_twoYears ||
    t.table_emissionsByCategory_twoYears ||
    t.table2_categoryAbs_twoYears ||
    [];

  if (!Array.isArray(rows) || rows.length === 0) return null;

  // Expected shape (guess): { category: string, values: { [year]: { emissions, pctOfTotal } } }
  const normalized = rows
    .map((r) => {
      const cat = r.category ?? r.categoryName ?? r.emission_category ?? r.name ?? "Category";
      const c = r.values?.[String(compareYear)] ?? r[compareYear] ?? {};
      const s = r.values?.[String(selectedYear)] ?? r[selectedYear] ?? {};
      return {
        category: String(cat),
        compareEm: num(c.emissions ?? c.total ?? c.value),
        selectedEm: num(s.emissions ?? s.total ?? s.value),
      };
    })
    .filter((x) => x.category && (x.selectedEm > 0 || x.compareEm > 0));

  if (normalized.length === 0) return null;

  const top = [...normalized].sort((a, b) => b.selectedEm - a.selectedEm).slice(0, 3);
  const totalSelected = normalized.reduce((sum, r) => sum + r.selectedEm, 0);

  // If totalSelected is 0, insights won't be meaningful.
  if (totalSelected <= 0) return null;

  const topLine = top
    .map((r) => {
      const pct = (r.selectedEm / totalSelected) * 100;
      return `${r.category} (${fmt(r.selectedEm)} tCO₂e, ${fmtPct(pct / 100)})`;
    })
    .join("; ");

  return `Key drivers in ${selectedLabel}: ${topLine}.`;
}

function FigureBlock({
  title,
  description,
  img,
  caption,
  height = 270,
}: {
  title?: string;
  description?: string;
  img?: string;
  caption: string;
  height?: number;
}) {
  if (!img) return null;

  return (
    <View style={[s.cardTight, s.fig]} wrap={false}>
      {title ? <Text style={s.h3}>{title}</Text> : null}
      {description ? <Text style={[s.p, { marginBottom: 8 }]}>{description}</Text> : null}

      {/* Chart frame: white background + padding reads much cleaner in PDF */}
      <View
        style={{
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: "#E6E8EC",
          borderRadius: 6,
          padding: 10,
        }}
      >
        <Image
          src={img}
          style={{
            width: "100%",
            height,
            objectFit: "contain",
          }}
        />
      </View>

      <Text style={s.figCap}>{caption}</Text>
    </View>
  );
}

export default function PdfExecutiveSummary({
  companyName,
  tablesData,
  compareLabel,
  selectedLabel,
  imgScopeComparison,
  imgCategoryAbs,
}: {
  companyName: string;
  tablesData: GhgReportTablesResponse;
  compareLabel: string;
  selectedLabel: string;
  imgScopeComparison: string;
  imgCategoryAbs: string;
}) {
  const compareYear = tablesData.filters.compareYear;
  const selectedYear = tablesData.filters.year;

  // Extract totals from Table 1 if present (helps the narrative feel “real”).
  const table1: any[] = ((tablesData.tables as any).table1_emissionsByScope_twoYears || []) as any[];
  const totalRow = table1.find((r) => String(r.scope).toLowerCase().includes("total"));
  const compareTotal = num(totalRow?.values?.[String(compareYear)]?.emissions);
  const selectedTotal = num(totalRow?.values?.[String(selectedYear)]?.emissions);

  const yoyPct =
    compareTotal > 0 ? ((selectedTotal - compareTotal) / compareTotal) * 100 : selectedTotal > 0 ? 100 : 0;

  const categoryInsight = buildCategoryInsights(tablesData, compareLabel, selectedLabel);

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Executive Summary</Text>

      <View style={s.card}>
        <Text style={s.p}>
          This Executive Summary presents a high-level comparison of greenhouse gas (GHG) emissions for {compareLabel} and {selectedLabel}.
          Results are shown by scope (Scopes 1–3) and by operational emission category to support management review, highlight material drivers,
          and improve year-over-year interpretability.
        </Text>

        <View style={{ height: 8 }} />

        <Text style={s.p}>
          {compareLabel} total emissions: <Text style={{ fontWeight: 700 }}>{fmt(compareTotal)}</Text> tCO₂e.{" "}
          {selectedLabel} total emissions: <Text style={{ fontWeight: 700 }}>{fmt(selectedTotal)}</Text> tCO₂e.{" "}
          {compareTotal > 0 || selectedTotal > 0 ? (
            <>
              This represents a year-over-year change of{" "}
              <Text style={{ fontWeight: 700 }}>{fmtPct(yoyPct / 100)}</Text>.
            </>
          ) : (
            <>No emissions were recorded for the selected periods.</>
          )}
        </Text>

        <View style={{ height: 8 }} />

        <Text style={s.p}>
          The table below summarizes emissions by scope, and the charts that follow provide a visual comparison by scope and by emission category.
          Use the category view to pinpoint the operational sources contributing most to total emissions and to prioritize reduction actions.
        </Text>
      </View>

      <PdfTable1 tablesData={tablesData} compareLabel={compareLabel} selectedLabel={selectedLabel} />

      <FigureBlock
        img={imgScopeComparison}
        height={265}
        caption="Figure 1: Emissions Comparison by Scope (YoY)"
        title="Emissions by Scope"
        description={`This chart compares Scopes 1–3 emissions across ${compareLabel} and ${selectedLabel}. It is intended to show where emissions are concentrated (direct vs. indirect) and how the emissions profile is shifting year over year.`}
      />

      <FigureBlock
        img={imgCategoryAbs}
        height={275}
        caption="Figure 2: Emissions by Category (YoY Comparison)"
        title="Emissions by Category"
        description={
          categoryInsight ||
          `This chart breaks total emissions into operational categories (e.g., electricity, combustion, fugitive emissions). It helps identify the main drivers of change between ${compareLabel} and ${selectedLabel}, and supports targeted actions such as fuel switching, efficiency projects, refrigerant management, and procurement of lower-carbon electricity.`
        }
      />

      <View style={s.footer} fixed>
        <Text style={s.footText}>{companyName}</Text>
        {/* <Text style={s.footText}>Executive Summary</Text> */}
         <Text
    style={s.footText}
    render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
  />
      </View>
    </Page>
  );
}

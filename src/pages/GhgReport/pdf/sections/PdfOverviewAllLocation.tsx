import  { useMemo } from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import type { GhgReportTablesResponse } from "../../../../services/ghgreportService";
import { fmt, pdfStyles as s } from "../PdfShared";

function OverviewTablePdf({ rows }: { rows: any[] }) {
  const sites = useMemo(() => {
    const map = new Map<number, { siteId: number; siteName: string }>();
    (rows || []).forEach((r) => {
      (r.bySite || []).forEach((x: any) => {
        if (!map.has(x.siteId)) map.set(x.siteId, { siteId: x.siteId, siteName: x.siteName });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.siteName.localeCompare(b.siteName));
  }, [rows]);

  const colScope = 72;
  const colCat = 170;
  const colTotal = 70;
  const remaining = 520 - (colScope + colCat + colTotal);
  const siteW = sites.length ? Math.max(60, Math.floor(remaining / sites.length)) : 0;

  const headCell = (w: number, borderRight = true) => ({
  width: w,
  ...(borderRight ? { borderRightWidth: 1, borderRightColor: "#e5e7eb" } : {}),
});

const bodyCell = (w: number, borderRight = true) => ({
  width: w,
  ...(borderRight ? { borderRightWidth: 1, borderRightColor: "#e5e7eb" } : {}),
});

  const valueByRowSite = (r: any, siteId: number) => (r.bySite || []).find((x: any) => x.siteId === siteId)?.value ?? 0;

 return (
  <View style={s.table}>
    <View style={s.trHead}>
      <Text style={[s.th, headCell(colScope)]}>Scope</Text>
      <Text style={[s.th, headCell(colCat)]}>Categories</Text>
      {sites.map((x, i) => (
        <Text key={x.siteId} style={[s.th, headCell(siteW, i !== sites.length - 1), s.right]}>
          {x.siteName}
        </Text>
      ))}
      <Text style={[s.th, headCell(colTotal, false), s.right]}>Total</Text>
    </View>

    {(rows || []).map((r: any, idx: number) => (
      <View key={`${r.scope}-${r.category}-${idx}`} style={idx === 0 ? s.tr : [s.tr, s.rowBorder]}>
        <Text style={[s.td, bodyCell(colScope)]}>{String(r.scope || "")}</Text>
        <Text style={[s.td, bodyCell(colCat)]}>{String(r.category || "")}</Text>
        {sites.map((x, i) => (
          <Text key={x.siteId} style={[s.td, bodyCell(siteW, i !== sites.length - 1), s.right]}>
            {fmt(valueByRowSite(r, x.siteId))}
          </Text>
        ))}
        <Text style={[s.td, bodyCell(colTotal, false), s.right, { fontWeight: 700 }]}>
          {fmt(r.total ?? 0)}
        </Text>
      </View>
    ))}
  </View>
);

}

export default function PdfOverviewAllLocations({
  companyName,
  tablesData,
  compareLabel,
  selectedLabel,
}: {
  companyName: string;
  tablesData: GhgReportTablesResponse;
  compareLabel: string;
  selectedLabel: string;
}) {
  const compareOverview: any = (tablesData.tables as any).table_overviewByLocations_compareYear;
  const selectedOverview: any = (tablesData.tables as any).table_overviewByLocations_selectedYear;

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Overview of Emissions by Location</Text>

      <View style={s.cardTight}>
        <Text style={s.h3}>{`Overview of emissions for all locations for ${compareLabel}`}</Text>
        <OverviewTablePdf rows={compareOverview?.rows || []} />
      </View>

      <View style={s.cardTight}>
        <Text style={s.h3}>{`Overview of emissions for all locations for ${selectedLabel}`}</Text>
        <OverviewTablePdf rows={selectedOverview?.rows || []} />
      </View>

      <View style={s.footer} fixed>
        <Text style={s.footText}>{companyName}</Text>
        <Text style={s.footText}>Overview</Text>
      </View>
    </Page>
  );
}


import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

type Totals = { scope1: number; scope2: number; scope3: number; total: number };

type BySiteRow = {
  siteId: number;
  siteName: string;
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  pctOfTotal: number;
};

type MonthlyBySiteRow = { month: string; siteId: number; siteName: string; total: number };
type SavedBySiteRow = { siteId: number; siteName: string; saved: number };
type RenewableKwhBySiteRow = { siteId: number; siteName: string; kwh: number; unit: string };

type IntensityMonthlyRow = {
  month: string;
  siteName: string;
  emissions: number;
  production: number;
  intensity: number;
  unit: string;
};

export type ReportPdfImages = {
  siteDonut?: string;
  monthlyTrend?: string;
  categoryPie?: string;
  savedEmissions?: string;
  scope2?: string;
  intensityTrend?: string;
};

export type ReportPdfProps = {
  title?: string;
  subtitle?: string;

  frequency: "yearly" | "monthly";
  year: number;
  month?: number | null;
  siteNamesText: string;
  categoriesText: string;

  totals: Totals;
  bySite: BySiteRow[];
  monthlyBySite: MonthlyBySiteRow[];
  savedBySite: SavedBySiteRow[];
  renewableKwhBySite: RenewableKwhBySiteRow[];
  intensityMonthly: IntensityMonthlyRow[];

  images: ReportPdfImages;
};

const BRAND = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";
const HEADER_BG = "#F1F5F9";
const PAGE_BG = "#FFFFFF";
const SOFT_BG = "#F8FAFC";

const styles = StyleSheet.create({
  page: {
    paddingTop: 26,
    paddingBottom: 42,
    paddingHorizontal: 32,
    fontSize: 10,
    color: BRAND,
    backgroundColor: PAGE_BG,
    fontFamily: "Helvetica",
  },

  chartPage: {
    paddingTop: 18,
    paddingBottom: 34,
    paddingHorizontal: 18,
    fontSize: 10,
    color: BRAND,
    backgroundColor: PAGE_BG,
    fontFamily: "Helvetica",
  },

  headerCard: {
    padding: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: SOFT_BG,
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: 700, color: BRAND, marginBottom: 2 },
  subtitle: { fontSize: 9.5, color: MUTED, lineHeight: 1.35 },

  metaRow: { flexDirection: "row", marginTop: 6, justifyContent: "space-between" },
  metaLeft: { fontSize: 9, color: MUTED },
  metaRight: { fontSize: 9, color: MUTED },

  section: { marginTop: 10 },
  sectionTitle: { fontSize: 11.5, fontWeight: 700, marginBottom: 6, color: BRAND },
  sectionNote: { fontSize: 9.3, color: MUTED, lineHeight: 1.42 },

  card: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#FFFFFF",
    marginTop: 8,
  },

  bulletList: { marginTop: 8 },
  bullet: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 12, color: BRAND, fontWeight: 700 },
  bulletText: { flex: 1, color: BRAND, lineHeight: 1.42 },

  tableCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 8,
    backgroundColor: "#FFFFFF",
  },
  row: { flexDirection: "row" },
  th: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: HEADER_BG,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    fontWeight: 700,
    color: BRAND,
    fontSize: 9.3,
  },
  td: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    color: BRAND,
    fontSize: 9.3,
  },
  lastCol: { borderRightWidth: 0 },
  tr: { borderTopWidth: 1, borderTopColor: BORDER },
  zebra: { backgroundColor: SOFT_BG },
  right: { textAlign: "right" },

  chartHeader: {
    marginBottom: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: SOFT_BG,
  },
  chartH1: { fontSize: 11, fontWeight: 700, marginBottom: 2, color: BRAND },
  chartH2: { fontSize: 8.5, color: MUTED },

  chartContainer: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    padding: 8,
  },

  footer: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
  footerLeft: { fontSize: 9, color: MUTED },
  footerRight: { fontSize: 9, color: MUTED },
});

function fmt2(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0.00";
  return v.toFixed(2);
}
function fmtPct(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0.00%";
  return `${v.toFixed(2)}%`;
}
function when(cond: boolean, style: any) {
  return cond ? [style] : [];
}
function uniqSorted(arr: string[]) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}
function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function formatMonthName(dateStr: string): string {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  const match = dateStr.match(/(\d{4})-(\d{2})/);
  if (!match) return dateStr;
  
  const year = match[1];
  const monthNum = parseInt(match[2], 10);
  const monthName = monthNames[monthNum - 1] || dateStr;
  
  return `${monthName} ${year}`;
}

function buildPivot<T extends { month: string; siteName: string }>(
  rows: T[],
  valueGetter: (r: T) => string | number
) {
  const months = uniqSorted(rows.map((r) => r.month));
  const sites = uniqSorted(rows.map((r) => r.siteName));

  const map = new Map<string, T>();
  rows.forEach((r) => map.set(`${r.month}||${r.siteName}`, r));

  const tableRows: (string | number)[][] = months.map((m) => {
    const row: (string | number)[] = [formatMonthName(m)];
    for (const s of sites) {
      const r = map.get(`${m}||${s}`);
      row.push(r ? valueGetter(r) : "—");
    }
    return row;
  });

  return { months, sites, tableRows };
}

function Footer({ reportTitle }: { reportTitle: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerLeft}>{reportTitle}</Text>
      <Text
        style={styles.footerRight}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

function Table({
  headers,
  widths,
  rows,
  alignRightCols = [],
}: {
  headers: string[];
  widths: number[];
  rows: (string | number)[][];
  alignRightCols?: number[];
}) {
  return (
    <View style={styles.tableCard}>
      <View style={styles.row}>
        {headers.map((h, idx) => (
          <Text
            key={`${h}-${idx}`}
            style={[
              styles.th,
              { width: `${widths[idx]}%` },
              ...when(alignRightCols.includes(idx), styles.right),
              ...when(idx === headers.length - 1, styles.lastCol),
            ]}
          >
            {h}
          </Text>
        ))}
      </View>

      {rows.map((r, ridx) => (
        <View key={ridx} style={[styles.row, styles.tr, ...when(ridx % 2 === 1, styles.zebra)]}>
          {r.map((cell, cidx) => (
            <Text
              key={`${ridx}-${cidx}`}
              style={[
                styles.td,
                { width: `${widths[cidx]}%` },
                ...when(alignRightCols.includes(cidx), styles.right),
                ...when(cidx === r.length - 1, styles.lastCol),
              ]}
            >
              {String(cell)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function ChartSection({
  title,
  subtitle,
  img,
}: {
  title: string;
  subtitle?: string;
  img?: string;
}) {
  if (!img) return null;

  return (
    <View style={styles.section} wrap={false} minPresenceAhead={300}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartH1}>{title}</Text>
        {subtitle ? <Text style={styles.chartH2}>{subtitle}</Text> : null}
      </View>

      <View style={styles.chartContainer}>
        <Image
          src={img}
          style={{
            width: "100%",
            height: "auto",
            maxHeight: 340,
            objectFit: "contain",
          }}
        />
      </View>
    </View>
  );
}

export default function ReportPdf(props: ReportPdfProps) {
  const {
    title = "EDE Emissions Report",
    subtitle = "Approved emissions + production data",
    frequency,
    year,
    month,
    siteNamesText,
    categoriesText,
    totals,
    bySite,
    monthlyBySite,
    savedBySite,
    renewableKwhBySite,
    intensityMonthly,
    images,
  } = props;

  const frequencyText = frequency.toUpperCase();

  const periodText =
    frequency === "yearly"
      ? `Reporting period: Year ${year}`
      : `Reporting period: ${year}-${String(month || 1).padStart(2, "0")}`;

  const totalsRows: (string | number)[][] = [
    ["Scope 1 (tCO2e)", fmt2(totals.scope1)],
    ["Scope 2 (tCO2e)", fmt2(totals.scope2)],
    ["Scope 3 (tCO2e)", fmt2(totals.scope3)],
    ["Total (tCO2e)", fmt2(totals.total)],
  ];

  const orgFootprintRows = bySite.map((s) => [
    s.siteName,
    fmt2(s.total),
    fmt2(s.scope1),
    fmt2(s.scope2),
    fmt2(s.scope3),
  ]);

  const pctRows = bySite.map((s) => [s.siteName, fmtPct(s.pctOfTotal)]);

  const monthlyPivot = buildPivot(monthlyBySite, (r) => fmt2(Number(r.total) || 0));
  const intensityPivot = buildPivot(intensityMonthly, (r) => Number(r.intensity || 0).toFixed(6));
  const intensityUnit = intensityMonthly?.[0]?.unit || "unit";

  const savedRows = savedBySite.map((s) => [s.siteName, fmt2(s.saved)]);
  const renewableRows = renewableKwhBySite.map((s) => [
    s.siteName,
    String(Math.round(Number(s.kwh) || 0)),
    s.unit || "kWh",
  ]);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerCard}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaLeft}>
              {frequencyText} • {periodText}
            </Text>
            <Text style={styles.metaRight}>Generated Report</Text>
          </View>

          <View style={[styles.metaRow, { marginTop: 6 }]}>
            <Text style={styles.metaLeft}>Sites: {siteNamesText}</Text>
            <Text style={styles.metaRight}>Categories: {categoriesText}</Text>
          </View>
        </View>

        <View style={styles.section} minPresenceAhead={170}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <View style={styles.card}>
            <Text style={styles.sectionNote}>
              This report consolidates approved greenhouse gas emissions across Scope 1, Scope 2, and Scope 3, and
              presents site-level distribution, renewable electricity outcomes, monthly emissions, and emission intensity
              where production data is available.
            </Text>

            <View style={styles.bulletList}>
              <View style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  Totals include approved records for scoped categories (Scope 1 + 2 + 3) only.
                </Text>
              </View>
              <View style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  Renewable electricity is tracked separately: "Produced" (kWh activity data) and "Saved" (tCO2e benefit).
                </Text>
              </View>
              <View style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  Monthly emission intensity is calculated as Emissions / Production for the same month and site.
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section} minPresenceAhead={200}>
          <Text style={styles.sectionTitle}>Overall Totals</Text>
          <View wrap={false}>
            <Table headers={["Metric", "Value"]} widths={[70, 30]} rows={totalsRows} alignRightCols={[1]} />
          </View>
        </View>

        <View style={styles.section} minPresenceAhead={240}>
          <Text style={styles.sectionTitle}>Total Organizational Footprint</Text>
          <Table
            headers={["Site", "Total (tCO2e)", "Scope 1", "Scope 2", "Scope 3"]}
            widths={[42, 18, 13, 13, 14]}
            rows={orgFootprintRows}
            alignRightCols={[1, 2, 3, 4]}
          />
        </View>

        <View style={styles.section} minPresenceAhead={180}>
          <Text style={styles.sectionTitle}>Emissions Distribution by Site</Text>
          <View wrap={false}>
            <Table headers={["Site", "% of Total"]} widths={[70, 30]} rows={pctRows} alignRightCols={[1]} />
          </View>
        </View>

        <Footer reportTitle={title} />
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.headerCard}>
          <Text style={styles.title}>Details</Text>
          <Text style={styles.subtitle}>Monthly totals and supplementary metrics</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLeft}>
              {frequencyText} • {periodText}
            </Text>
            <Text style={styles.metaRight}>Sites: {siteNamesText}</Text>
          </View>
        </View>

        <View style={styles.section} minPresenceAhead={220}>
          <Text style={styles.sectionTitle}>Monthly Emissions (Scope 1 + 2 + 3)</Text>
          <Text style={styles.sectionNote}>Rows show months; columns show sites (tCO2e).</Text>

          {chunk(monthlyPivot.sites, 3).map((siteChunk, idx) => {
            const headers = ["Month", ...siteChunk];
            const widths =
              headers.length === 2 ? [22, 78] : headers.length === 3 ? [18, 41, 41] : [16, 28, 28, 28];

            const rows = monthlyPivot.tableRows.map((r) => {
              const monthVal = r[0];
              const valuesBySite = monthlyPivot.sites.reduce<Record<string, string | number>>((acc, s, i) => {
                acc[s] = r[i + 1];
                return acc;
              }, {});
              return [monthVal, ...siteChunk.map((s) => valuesBySite[s] ?? "—")];
            });

            return (
              <View key={`em-p-${idx}`} style={{ marginTop: idx === 0 ? 0 : 10 }} minPresenceAhead={170}>
                <Table
                  headers={headers}
                  widths={widths}
                  rows={rows}
                  alignRightCols={headers.map((_, i) => i).slice(1)}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.section} minPresenceAhead={220}>
          <Text style={styles.sectionTitle}>Renewable Electricity</Text>
          <Text style={styles.sectionNote}>"Produced" is kWh activity data; "Saved" is tCO2e benefit.</Text>

          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { fontSize: 10.5, marginBottom: 4 }]}>Emissions Saved (tCO2e)</Text>
            <Table headers={["Site", "Saved (tCO2e)"]} widths={[70, 30]} rows={savedRows} alignRightCols={[1]} />

            <Text style={[styles.sectionTitle, { fontSize: 10.5, marginTop: 10, marginBottom: 4 }]}>
              Renewable Energy Produced
            </Text>
            <Table headers={["Site", "Produced", "Unit"]} widths={[60, 20, 20]} rows={renewableRows} alignRightCols={[1]} />
          </View>
        </View>

        <View style={styles.section} minPresenceAhead={220}>
          <Text style={styles.sectionTitle}>Monthly Emission Intensity</Text>
          <Text style={styles.sectionNote}>Rows show months; columns show sites (tCO2e / {intensityUnit}).</Text>

          {chunk(intensityPivot.sites, 3).map((siteChunk, idx) => {
            const headers = ["Month", ...siteChunk];
            const widths =
              headers.length === 2 ? [22, 78] : headers.length === 3 ? [18, 41, 41] : [16, 28, 28, 28];

            const rows = intensityPivot.tableRows.map((r) => {
              const monthVal = r[0];
              const valuesBySite = intensityPivot.sites.reduce<Record<string, string | number>>((acc, s, i) => {
                acc[s] = r[i + 1];
                return acc;
              }, {});
              return [monthVal, ...siteChunk.map((s) => valuesBySite[s] ?? "—")];
            });

            return (
              <View key={`int-p-${idx}`} style={{ marginTop: idx === 0 ? 0 : 10 }} minPresenceAhead={170}>
                <Table
                  headers={headers}
                  widths={widths}
                  rows={rows}
                  alignRightCols={headers.map((_, i) => i).slice(1)}
                />
              </View>
            );
          })}
        </View>

        <Footer reportTitle={title} />
      </Page>

      <Page size="A4" style={styles.chartPage}>
        <View style={styles.headerCard}>
          <Text style={styles.title}>Charts & Visualizations</Text>
          <Text style={styles.subtitle}>Emissions analysis and trends</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLeft}>
              {frequencyText} • {periodText}
            </Text>
            <Text style={styles.metaRight}>Sites: {siteNamesText}</Text>
          </View>
        </View>

        <ChartSection
          title="Percentage of Emissions (Scope 1 + 2 + 3)"
          subtitle="Site share of total emissions."
          img={images.siteDonut}
        />

        <ChartSection
          title="Monthly Emissions (tCO2e)"
          subtitle="Monthly total emissions by site."
          img={images.monthlyTrend}
        />

        <Footer reportTitle={title} />
      </Page>

      <Page size="A4" style={styles.chartPage}>
        <View style={styles.headerCard}>
          <Text style={styles.title}>Charts & Visualizations (Continued)</Text>
          <Text style={styles.subtitle}>Renewable energy metrics</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLeft}>
              {frequencyText} • {periodText}
            </Text>
            <Text style={styles.metaRight}>Sites: {siteNamesText}</Text>
          </View>
        </View>

        <ChartSection
          title="Renewable Energy Produced"
          subtitle="Activity data (kWh) by site."
          img={images.categoryPie}
        />

        <ChartSection
          title="Emissions Saved (tCO2e)"
          subtitle="Renewable electricity benefit by site."
          img={images.savedEmissions}
        />

        <Footer reportTitle={title} />
      </Page>

      <Page size="A4" style={styles.chartPage}>
        <View style={styles.headerCard}>
          <Text style={styles.title}>Charts & Visualizations (Continued)</Text>
          <Text style={styles.subtitle}>Intensity analysis</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLeft}>
              {frequencyText} • {periodText}
            </Text>
            <Text style={styles.metaRight}>Sites: {siteNamesText}</Text>
          </View>
        </View>

        <ChartSection
          title="Monthly Emission Intensity Trend"
          subtitle="Emissions and intensity trend."
          img={images.intensityTrend}
        />

        <Footer reportTitle={title} />
      </Page>
    </Document>
  );
}
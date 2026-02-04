

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
    paddingTop: 30,
    paddingBottom: 46,
    paddingHorizontal: 34,
    fontSize: 10,
    color: BRAND,
    backgroundColor: PAGE_BG,
    fontFamily: "Helvetica",
  },

  // Header
  topHeader: {
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: SOFT_BG,
    marginBottom: 10,
  },
  title: { fontSize: 18, fontWeight: 700, color: BRAND, marginBottom: 3 },
  subtitle: { fontSize: 10, color: MUTED, lineHeight: 1.35 },

  badgeRow: { flexDirection: "row", marginTop: 8, alignItems: "center" },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    marginRight: 8,
  },
  badgeText: { fontSize: 9, color: BRAND, fontWeight: 700 },
  badgeMuted: { fontSize: 9, color: MUTED },

  // Meta
  metaGrid: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#FFFFFF",
    marginTop: 10,
  },
  metaRow: { flexDirection: "row", marginBottom: 6 },
  metaKey: { width: 86, color: MUTED, fontWeight: 700, fontSize: 9.5 },
  metaVal: { flex: 1, color: BRAND, fontSize: 9.5, lineHeight: 1.3 },

  // Section
  section: { marginTop: 10 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 6, color: BRAND },
  sectionNote: { fontSize: 9.5, color: MUTED, lineHeight: 1.42 },

  card: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#FFFFFF",
    marginTop: 8,
  },

  // Bullets
  bulletList: { marginTop: 8 },
  bullet: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 12, color: BRAND, fontWeight: 700 },
  bulletText: { flex: 1, color: BRAND, lineHeight: 1.42 },

  // Tables
  tableCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
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
    fontSize: 9.5,
  },
  td: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    color: BRAND,
    fontSize: 9.5,
  },
  lastCol: { borderRightWidth: 0 },
  tr: { borderTopWidth: 1, borderTopColor: BORDER },
  zebra: { backgroundColor: SOFT_BG },
  right: { textAlign: "right" },

  // Charts
  chartCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#FFFFFF",
    marginTop: 10,
  },
  chartTitle: { fontSize: 11.5, fontWeight: 700, marginBottom: 3, color: BRAND },
  chartSub: { fontSize: 9.5, color: MUTED, marginBottom: 6, lineHeight: 1.3 },
  chartImg: { width: "100%", height: 240, objectFit: "contain" },

  // Footer
  footer: {
    position: "absolute",
    left: 34,
    right: 34,
    bottom: 18,
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
  widths: number[]; // must sum to 100
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
        <View
          key={ridx}
          style={[styles.row, styles.tr, ...when(ridx % 2 === 1, styles.zebra)]}
        >
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

function ChartCard({
  title,
  subtitle,
  img,
  height = 240,
}: {
  title: string;
  subtitle?: string;
  img?: string;
  height?: number;
}) {
  if (!img) return null;

  return (
    <View style={styles.chartCard} wrap={false} minPresenceAhead={height + 70}>
      <Text style={styles.chartTitle}>{title}</Text>
      {subtitle ? <Text style={styles.chartSub}>{subtitle}</Text> : null}
      <Image style={[styles.chartImg, { height }]} src={img} />
    </View>
  );
}

export default function ReportPdf(props: ReportPdfProps) {
  const {
    title = "EDE Emissions Report",
    subtitle = "Generated from approved emissions and production data",
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

  const monthlyRows = monthlyBySite.slice(0, 80).map((m) => [
    m.month,
    m.siteName,
    fmt2(m.total),
  ]);

  const savedRows = savedBySite.map((s) => [s.siteName, fmt2(s.saved)]);

  const renewableRows = renewableKwhBySite.map((s) => [
    s.siteName,
    String(Math.round(Number(s.kwh) || 0)),
    s.unit || "kWh",
  ]);

  const intensityRows = intensityMonthly.slice(0, 80).map((m) => [
    m.month,
    fmt2(m.emissions),
    String(Math.round(Number(m.production) || 0)),
    m.unit || "unit",
    Number(m.intensity || 0).toFixed(6),
  ]);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topHeader}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{frequency.toUpperCase()}</Text>
            </View>
            <Text style={styles.badgeMuted}>{periodText}</Text>
          </View>

          <View style={styles.metaGrid}>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Sites</Text>
              <Text style={styles.metaVal}>{siteNamesText}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Categories</Text>
              <Text style={styles.metaVal}>{categoriesText}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section} minPresenceAhead={180}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <View style={styles.card}>
            <Text style={styles.sectionNote}>
              This report consolidates approved greenhouse gas emissions across Scope 1, Scope 2, and
              Scope 3, and presents site-level distribution, renewable electricity outcomes, monthly
              emissions, and emission intensity where production data is available.
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
                  Renewable electricity is tracked separately: “Produced” (kWh activity data) and “Saved” (tCO2e benefit).
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

        <View style={styles.section} minPresenceAhead={260}>
          <Text style={styles.sectionTitle}>Total Organizational Footprint</Text>
          <Table
            headers={["Site", "Total (tCO2e)", "Scope 1", "Scope 2", "Scope 3"]}
            widths={[42, 18, 13, 13, 14]}
            rows={orgFootprintRows}
            alignRightCols={[1, 2, 3, 4]}
          />
        </View>

        <View style={styles.section} minPresenceAhead={220}>
          <Text style={styles.sectionTitle}>Emissions Distribution by Site</Text>
          <View wrap={false}>
            <Table headers={["Site", "% of Total"]} widths={[70, 30]} rows={pctRows} alignRightCols={[1]} />
          </View>
        </View>

        <Footer reportTitle={title} />
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.topHeader}>
          <Text style={styles.title}>Details</Text>
          <Text style={styles.subtitle}>Monthly totals and supplementary metrics</Text>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{frequency.toUpperCase()}</Text>
            </View>
            <Text style={styles.badgeMuted}>{periodText}</Text>
          </View>
        </View>

        <View style={styles.section} minPresenceAhead={260}>
          <Text style={styles.sectionTitle}>Monthly Emissions (Scope 1 + 2 + 3)</Text>
          <Text style={styles.sectionNote}>
            Monthly totals are calculated from approved emission entries for scoped categories (Scope 1, Scope 2, Scope 3).
          </Text>

          <Table
            headers={["Month", "Site", "Total (tCO2e)"]}
            widths={[18, 52, 30]}
            rows={monthlyRows}
            alignRightCols={[2]}
          />

          {monthlyBySite.length > 80 ? (
            <Text style={[styles.sectionNote, { marginTop: 6 }]}>Showing first 80 rows.</Text>
          ) : null}
        </View>

        <View style={styles.section} minPresenceAhead={340}>
          <Text style={styles.sectionTitle}>Renewable Electricity</Text>
          <Text style={styles.sectionNote}>
            “Produced” reflects activity data (kWh). “Saved” reflects the recorded emissions benefit (tCO2e).
          </Text>

          <View style={styles.card}>
            <Text style={[styles.sectionTitle, { fontSize: 11, marginBottom: 6 }]}>Emissions Saved (tCO2e)</Text>
            <Table headers={["Site", "Saved (tCO2e)"]} widths={[70, 30]} rows={savedRows} alignRightCols={[1]} />

            <Text style={[styles.sectionTitle, { fontSize: 11, marginTop: 12, marginBottom: 6 }]}>
              Renewable Energy Produced
            </Text>
            <Table headers={["Site", "Produced", "Unit"]} widths={[60, 20, 20]} rows={renewableRows} alignRightCols={[1]} />
          </View>
        </View>

        <View style={styles.section} minPresenceAhead={260}>
          <Text style={styles.sectionTitle}>Monthly Emission Intensity</Text>
          <Text style={styles.sectionNote}>
            Intensity is computed per month: Intensity = Emissions (tCO2e) / Production (unit). If production is missing, intensity is shown as 0.
          </Text>

          <Table
            headers={["Month", "Emissions", "Production", "Unit", "Intensity"]}
            widths={[16, 18, 18, 12, 36]}
            rows={intensityRows}
            alignRightCols={[1, 2, 4]}
          />

          {intensityMonthly.length > 80 ? (
            <Text style={[styles.sectionNote, { marginTop: 6 }]}>Showing first 80 rows.</Text>
          ) : null}
        </View>

        <Footer reportTitle={title} />
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.topHeader}>
          <Text style={styles.title}>Charts</Text>
          <Text style={styles.subtitle}>Captured from on-screen preview</Text>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{frequency.toUpperCase()}</Text>
            </View>
            <Text style={styles.badgeMuted}>{periodText}</Text>
          </View>
        </View>

        <ChartCard
          title="Percentage of Emissions (Scope 1 + 2 + 3)"
          subtitle="Site share of total emissions."
          img={images.siteDonut}
          height={240}
        />

        <ChartCard
          title="Monthly Emissions (tCO2e)"
          subtitle="Monthly total emissions by site."
          img={images.monthlyTrend}
          height={240}
        />

        <ChartCard
          title="Renewable Energy Produced"
          subtitle="Activity data (kWh) by site."
          img={images.categoryPie}
          height={240}
        />

        <ChartCard
          title="Emissions Saved (tCO2e)"
          subtitle="Renewable electricity benefit by site."
          img={images.savedEmissions}
          height={240}
        />

        <ChartCard
          title="Monthly Emission Intensity Trend"
          subtitle="Emissions vs intensity trend."
          img={images.intensityTrend}
          height={240}
        />

        <Footer reportTitle={title} />
      </Page>
    </Document>
  );
}

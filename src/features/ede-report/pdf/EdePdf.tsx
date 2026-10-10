import { Defs, Document, Image, LinearGradient, Page, Rect, Stop, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { PdfTheme } from "../../../theme";
import type { EdeReportResponse } from "../../../services/reportService";
import { POWERED_BY_TEXT, type ReportPeriod } from "../../../ui";
import { type EdeFigures, type SiteRef, edePeriodLabel, intensitySeries, intensitySites, monthLabel, monthlyGrid, overallTotals } from "../logic";
import type { EdePdfCharts } from "./charts";

export type EdePdfProps = {
  theme: PdfTheme;
  /** Data URL of the client's logo, when it could be loaded. */
  logo?: string;
  company: string;
  period: ReportPeriod;
  sitesText: string;
  categoriesText: string;
  data: EdeReportResponse;
  figures: EdeFigures;
  sites: SiteRef[];
  charts: EdePdfCharts;
  generatedAt: Date;
};

const n = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");

function styles(t: PdfTheme) {
  const c = t.colors;
  return StyleSheet.create({
    page: { padding: 40, paddingBottom: 56, fontFamily: t.fonts.ui, fontSize: 9.5, color: c.ink, backgroundColor: c.paper },
    cover: { position: "relative", fontFamily: t.fonts.ui, backgroundColor: c.paper },
    coverBody: { position: "absolute", top: 0, left: 0, right: 0, height: 420, padding: 56, justifyContent: "flex-end" },
    coverKicker: { fontSize: 11, color: t.cover.text, letterSpacing: 1.5, marginBottom: 8 },
    coverTitle: { fontSize: 32, fontWeight: 700, color: t.cover.text, marginBottom: 6 },
    coverCompany: { fontSize: 16, color: t.cover.text },
    coverLogo: { position: "absolute", top: 48, left: 56, maxHeight: 48, maxWidth: 180, objectFit: "contain" },
    coverMeta: { position: "absolute", top: 470, left: 56, right: 56 },
    metaRow: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.line },
    metaLabel: { width: 140, color: c.muted },
    metaValue: { flex: 1 },
    coverFoot: { position: "absolute", bottom: 40, left: 56, right: 56, fontSize: 9, color: c.muted },
    h1: { fontSize: 16, fontWeight: 700, color: c.brandText, marginBottom: 2 },
    h2: { fontSize: 11.5, fontWeight: 700, color: c.ink, marginBottom: 6, marginTop: 14 },
    note: { fontSize: 8.5, color: c.muted, marginBottom: 6, lineHeight: 1.35 },
    table: { borderWidth: 1, borderColor: c.line, borderRadius: 3 },
    tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: c.line },
    th: { flexDirection: "row", backgroundColor: c.tint },
    cell: { paddingVertical: 4, paddingHorizontal: 6 },
    head: { fontSize: 8.5, fontWeight: 700, color: c.muted },
    num: { textAlign: "right", fontFamily: t.fonts.num },
    kpis: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
    kpi: { width: "33.33%", padding: 8, borderWidth: 1, borderColor: c.line },
    kpiLabel: { fontSize: 8, color: c.muted, marginBottom: 2 },
    kpiValue: { fontSize: 14, fontWeight: 700, fontFamily: t.fonts.num },
    chart: { width: "100%", objectFit: "contain", marginTop: 4 },
    footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: c.muted },
    dot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 5, marginTop: 1 },
  });
}

type S = ReturnType<typeof styles>;

function Table({ s, headers, widths, rows, numeric }: { s: S; headers: string[]; widths: number[]; rows: (string | number)[][]; numeric: number[] }) {
  return (
    <View style={s.table}>
      <View style={s.th} fixed>
        {headers.map((h, i) => (
          <Text key={i} style={[s.cell, s.head, { width: `${widths[i]}%` }, numeric.includes(i) ? s.num : {}]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={s.tr} wrap={false}>
          {r.map((v, i) => (
            <Text key={i} style={[s.cell, { width: `${widths[i]}%` }, numeric.includes(i) ? s.num : {}]}>
              {String(v)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Chart({ s, title, note, src }: { s: S; title: string; note?: string; src?: string }) {
  if (!src) return null;
  return (
    <View wrap={false}>
      <Text style={s.h2}>{title}</Text>
      {note && <Text style={s.note}>{note}</Text>}
      <Image src={src} style={s.chart} />
    </View>
  );
}

function Footer({ s, label }: { s: S; label: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{label}</Text>
      <Text>{POWERED_BY_TEXT}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

/** Month × site table, split into chunks of 4 sites so it fits A4. */
function pivot(months: string[], cols: { name: string; values: (number | null)[] }[], decimals: number) {
  const chunks: (typeof cols)[] = [];
  for (let i = 0; i < cols.length; i += 4) chunks.push(cols.slice(i, i + 4));
  return chunks.map((chunk) => ({
    headers: ["Month", ...chunk.map((c) => c.name)],
    widths: [22, ...chunk.map(() => 78 / chunk.length)],
    rows: months.map((m, mi) => [monthLabel(m), ...chunk.map((c) => (c.values[mi] === null ? "—" : n(c.values[mi] as number, decimals)))]),
  }));
}

/** The branded EDE report: client cover, summary, details, charts. Always printed in the brand's Light colours. */
export function EdePdf(p: EdePdfProps) {
  const { theme: t, data, figures: f } = p;
  const s = styles(t);
  const periodText = edePeriodLabel(p.period);
  const footer = `EDE report · ${p.company} · ${periodText}`;
  const grid = monthlyGrid(data, p.period, p.sites);
  // Sites with production only (no production means no intensity), on the union of their months.
  const intensity = intensitySites(data, p.sites)
    .map((x) => ({ site: x, series: intensitySeries(data, p.period, x) }))
    .filter((x) => x.series.intensity.some((v) => v !== null));
  const intensityMonths = [...new Set(intensity.flatMap((x) => x.series.months))].sort();
  const intensityAt = (x: (typeof intensity)[number], m: string) => {
    const i = x.series.months.indexOf(m);
    return i < 0 ? null : x.series.intensity[i];
  };
  const kpis: [string, string][] = [
    ["Total emissions", `${n(f.total)} tCO2e`],
    ["Scope 1", `${n(f.scope1)} tCO2e`],
    ["Scope 2", `${n(f.scope2)} tCO2e`],
    ["Scope 3", `${n(f.scope3)} tCO2e`],
    ["Renewable produced", `${n(f.renewableKwh, 0)} kWh`],
    ["Saved by renewables", `${n(f.saved)} tCO2e`],
  ];

  return (
    <Document title={`EDE report ${p.company} ${periodText}`} author={p.company} creator="PlanetPulse ESGLite">
      <Page size="A4" style={s.cover}>
        <Svg width="595" height="420" style={{ position: "absolute", top: 0, left: 0 }}>
          <Defs>
            <LinearGradient id="cover" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={t.cover.from} />
              <Stop offset="1" stopColor={t.cover.to} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="595" height="420" fill="url(#cover)" />
        </Svg>
        {p.logo && <Image src={p.logo} style={s.coverLogo} />}
        <View style={s.coverBody}>
          <Text style={s.coverKicker}>EMISSIONS DATA ENTRY REPORT</Text>
          <Text style={s.coverTitle}>EDE report</Text>
          <Text style={s.coverCompany}>{p.company}</Text>
        </View>
        <View style={s.coverMeta}>
          {[
            ["Reporting period", periodText],
            ["Sites", p.sitesText],
            ["Categories", p.categoriesText],
            ["Data", "Approved emissions and production"],
            ["Generated", p.generatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })],
          ].map(([label, value]) => (
            <View key={label} style={s.metaRow}>
              <Text style={s.metaLabel}>{label}</Text>
              <Text style={s.metaValue}>{value}</Text>
            </View>
          ))}
        </View>
        <Text style={s.coverFoot}>{POWERED_BY_TEXT}</Text>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Summary</Text>
        <Text style={s.note}>
          Totals cover approved Scope 1, 2 and 3 records. Renewable electricity is tracked separately: produced (kWh of activity data) and saved (tCO2e
          avoided), outside the scope totals. Intensity is a month's emissions divided by the same month's approved production at that site.
        </Text>
        <View style={s.kpis}>
          {kpis.map(([label, value]) => (
            <View key={label} style={s.kpi}>
              <Text style={s.kpiLabel}>{label}</Text>
              <Text style={s.kpiValue}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>Overall totals</Text>
        <Table
          s={s}
          headers={["Metric", "Value", "Unit"]}
          widths={[60, 25, 15]}
          numeric={[1]}
          rows={overallTotals(f).map((r) => [r.metric.replace("₂", "2"), n(r.value, r.unit === "kWh" ? 0 : 2), r.unit.replace("₂", "2")])}
        />

        <Text style={s.h2}>Footprint by site</Text>
        <Table
          s={s}
          headers={["Site", "Total", "Scope 1", "Scope 2", "Scope 3", "Share"]}
          widths={[30, 15, 13, 13, 13, 16]}
          numeric={[1, 2, 3, 4, 5]}
          rows={[...data.bySite]
            .sort((a, b) => b.total - a.total)
            .map((r) => [r.siteName, n(r.total), n(r.scope1), n(r.scope2), n(r.scope3), `${n(r.pctOfTotal, 1)}%`])}
        />
        <Chart s={s} title="Share by site" note="Each site's share of Scope 1 + 2 + 3 emissions." src={p.charts.share} />
        <Footer s={s} label={footer} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Month by month</Text>
        <Chart s={s} title="Monthly emissions by site (tCO2e)" src={p.charts.monthly} />
        <Text style={s.h2}>Monthly emissions (tCO2e)</Text>
        {pivot(
          grid.months,
          // Renewables-only sites have no emissions to tabulate (same filter as the chart).
          grid.series.filter((x) => x.values.some((v) => v !== 0)).map((x) => ({ name: x.siteName, values: x.values })),
          2,
        ).map((tb, i) => (
          <View key={i} style={{ marginBottom: 8 }}>
            <Table s={s} headers={tb.headers} widths={tb.widths} rows={tb.rows} numeric={tb.headers.map((_, j) => j).slice(1)} />
          </View>
        ))}
        <Footer s={s} label={footer} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Renewables and intensity</Text>
        <Chart s={s} title="Renewables produced (kWh)" src={p.charts.renewables} />
        <Chart s={s} title="Emissions saved (tCO2e)" note="Avoided by renewables; not part of the scope totals." src={p.charts.saved} />
        <Text style={s.h2}>Renewable electricity by site</Text>
        <Table
          s={s}
          headers={["Site", "Produced (kWh)", "Saved (tCO2e)"]}
          widths={[50, 25, 25]}
          numeric={[1, 2]}
          rows={p.sites
            .map((x) => [
              x.siteName,
              n(Number(data.renewableKwhBySite.find((r) => r.siteId === x.siteId)?.kwh ?? 0), 0),
              n(Number(data.savedBySite.find((r) => r.siteId === x.siteId)?.saved ?? 0)),
            ])
            .filter((r) => r[1] !== "0" || r[2] !== "0.00")}
        />
        <Chart s={s} title="Intensity trend" note="tCO2e per unit of approved production; blank where a month has no production." src={p.charts.intensity} />
        {intensity.length > 0 && (
          <>
            <Text style={s.h2}>Monthly intensity</Text>
            {pivot(
              intensityMonths,
              intensity.map((x) => ({ name: `${x.site.siteName} (tCO2e/${x.series.unit})`, values: intensityMonths.map((m) => intensityAt(x, m)) })),
              6,
            ).map((tb, i) => (
              <View key={i} style={{ marginBottom: 8 }}>
                <Table s={s} headers={tb.headers} widths={tb.widths} rows={tb.rows} numeric={tb.headers.map((_, j) => j).slice(1)} />
              </View>
            ))}
          </>
        )}
        <Footer s={s} label={footer} />
      </Page>
    </Document>
  );
}

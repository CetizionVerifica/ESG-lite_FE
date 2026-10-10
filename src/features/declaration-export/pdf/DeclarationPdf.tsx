import { Defs, Document, Image, LinearGradient, Page, Rect, Stop, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { PdfTheme } from "../../../theme";
import type { Declaration } from "../../../services/pcfExportService";
import { POWERED_BY_TEXT } from "../../../ui";
import { STATUS_LABEL, allocationLabel, boundaryLabel, formatKg, formatPct, periodLabel, stageRows, standardLabel } from "../logic";

export type DeclarationPdfProps = {
  theme: PdfTheme;
  /** Data URL of the client's logo, when it could be loaded. */
  logo?: string;
  declaration: Declaration;
};

const CO2 = "kgCO2e";

function styles(t: PdfTheme) {
  const c = t.colors;
  return StyleSheet.create({
    page: { padding: 40, paddingBottom: 56, fontFamily: t.fonts.ui, fontSize: 9.5, color: c.ink, backgroundColor: c.paper },
    cover: { position: "relative", fontFamily: t.fonts.ui, backgroundColor: c.paper },
    coverBody: { position: "absolute", top: 0, left: 0, right: 0, height: 420, padding: 56, justifyContent: "flex-end" },
    coverKicker: { fontSize: 11, color: t.cover.text, letterSpacing: 1.5, marginBottom: 8 },
    coverTitle: { fontSize: 28, fontWeight: 700, color: t.cover.text, marginBottom: 6 },
    coverCompany: { fontSize: 14, color: t.cover.text },
    coverLogo: { position: "absolute", top: 48, left: 56, maxHeight: 48, maxWidth: 180, objectFit: "contain" },
    coverMeta: { position: "absolute", top: 450, left: 56, right: 56 },
    coverTotal: { flexDirection: "row", alignItems: "flex-end", marginBottom: 14 },
    coverTotalValue: { fontSize: 30, fontWeight: 700, fontFamily: t.fonts.num, color: c.brandText, marginRight: 8 },
    coverTotalUnit: { fontSize: 11, color: c.muted, marginBottom: 5 },
    metaRow: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: c.line },
    metaLabel: { width: 150, color: c.muted },
    metaValue: { flex: 1 },
    coverFoot: { position: "absolute", bottom: 40, left: 56, right: 56, fontSize: 9, color: c.muted },
    h1: { fontSize: 16, fontWeight: 700, color: c.brandText, marginBottom: 4 },
    h2: { fontSize: 11.5, fontWeight: 700, color: c.ink, marginBottom: 6, marginTop: 14 },
    note: { fontSize: 8.5, color: c.muted, marginBottom: 6, lineHeight: 1.35 },
    table: { borderWidth: 1, borderColor: c.line, borderRadius: 3 },
    tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: c.line },
    th: { flexDirection: "row", backgroundColor: c.tint },
    cell: { paddingVertical: 4, paddingHorizontal: 6 },
    head: { fontSize: 8.5, fontWeight: 700, color: c.muted },
    num: { textAlign: "right", fontFamily: t.fonts.num },
    kpis: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
    kpi: { width: "33.33%", padding: 8, borderWidth: 1, borderColor: c.line },
    kpiLabel: { fontSize: 8, color: c.muted, marginBottom: 2 },
    kpiValue: { fontSize: 13, fontWeight: 700, fontFamily: t.fonts.num },
    barRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
    barLabel: { width: 110 },
    barTrack: { flex: 1, height: 9, backgroundColor: c.tint, borderRadius: 2 },
    barValue: { width: 90, textAlign: "right", fontFamily: t.fonts.num },
    flow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
    flowBox: { flex: 1, borderWidth: 1, borderColor: c.line, borderRadius: 3, padding: 6, backgroundColor: c.tint },
    flowArrow: { width: 16, textAlign: "center", color: c.muted },
    flowTitle: { fontSize: 8.5, fontWeight: 700 },
    flowSub: { fontSize: 7.5, color: c.muted },
    callout: { borderWidth: 1, borderColor: c.warn, backgroundColor: c.warnSoft, borderRadius: 3, padding: 8, marginTop: 8 },
    footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: c.muted },
    watermark: { position: "absolute", top: 360, left: 90, fontSize: 96, fontWeight: 700, color: c.bad, opacity: 0.12, transform: "rotate(-35deg)" },
  });
}

type S = ReturnType<typeof styles>;

function Table({ s, headers, widths, rows, numeric }: { s: S; headers: string[]; widths: number[]; rows: string[][]; numeric: number[] }) {
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
              {v}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Meta({ s, rows }: { s: S; rows: [string, string][] }) {
  return (
    <View>
      {rows.map(([label, value]) => (
        <View key={label} style={s.metaRow}>
          <Text style={s.metaLabel}>{label}</Text>
          <Text style={s.metaValue}>{value}</Text>
        </View>
      ))}
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

function Watermark({ s, show }: { s: S; show: boolean }) {
  return show ? (
    <Text style={s.watermark} fixed>
      DRAFT
    </Text>
  ) : null;
}

const dateText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";

/** The branded product carbon footprint declaration: cover, summary, inputs and data quality, method notes. */
export function DeclarationPdf({ theme: t, logo, declaration: d }: DeclarationPdfProps) {
  const s = styles(t);
  const unit = `${CO2} per ${d.declared_unit.label}`;
  const stages = stageRows(d);
  const maxStage = Math.max(0, ...stages.map((r) => r.value ?? 0));
  const footer = `${d.product.name} · v${d.version} · ${STATUS_LABEL[d.status]}`;
  const period = periodLabel(d.reference_period);
  const verified = d.reviewed_by && !d.draft ? `Reviewed by ${d.reviewed_by} on ${dateText(d.reviewed_at)}` : "Not yet reviewed";

  return (
    <Document title={`Product carbon footprint ${d.product.name}`} author={d.company.name} creator="PlanetPulse ESGLite">
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
        {logo && <Image src={logo} style={s.coverLogo} />}
        <View style={s.coverBody}>
          <Text style={s.coverKicker}>PRODUCT CARBON FOOTPRINT DECLARATION</Text>
          <Text style={s.coverTitle}>{d.product.name}</Text>
          <Text style={s.coverCompany}>{d.company.name}</Text>
        </View>
        <View style={s.coverMeta}>
          <View style={s.coverTotal}>
            <Text style={s.coverTotalValue}>{formatKg(d.total_kg_per_unit)}</Text>
            <Text style={s.coverTotalUnit}>{unit}</Text>
          </View>
          <Meta
            s={s}
            rows={[
              ["Declared unit", d.declared_unit.label],
              ["Reference period", period],
              ["Site", d.site.country ? `${d.site.name}, ${d.site.country}` : d.site.name],
              ["Status", `${STATUS_LABEL[d.status]} · version ${d.version}`],
              ["Generated", dateText(d.generated_at)],
            ]}
          />
        </View>
        <Text style={s.coverFoot}>{POWERED_BY_TEXT}</Text>
        <Watermark s={s} show={d.draft} />
      </Page>

      <Page size="A4" style={s.page}>
        <Watermark s={s} show={d.draft} />
        <Text style={s.h1}>Summary</Text>
        <Text style={s.note}>
          {`${boundaryLabel(d.method.boundary)} footprint of one declared unit (${d.declared_unit.label}), calculated to ${standardLabel(d.method.standard)} with ${d.method.gwp_sets.join(", ")} global warming potentials.`}
        </Text>
        <View style={s.kpis}>
          {[
            ["Total", `${formatKg(d.total_kg_per_unit)} ${CO2}`],
            ["Primary data share", formatPct(d.primary_data_share_pct)],
            ["Data quality (DQR)", d.dqr ? d.dqr.overall.toFixed(2) : "—"],
          ].map(([label, value]) => (
            <View key={label} style={s.kpi}>
              <Text style={s.kpiLabel}>{label}</Text>
              <Text style={s.kpiValue}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>By life-cycle stage</Text>
        {stages.map((r, i) => (
          <View key={r.id} style={s.barRow} wrap={false}>
            <Text style={s.barLabel}>{r.label}</Text>
            <View style={s.barTrack}>
              {r.value !== null && maxStage > 0 && (
                <View style={{ width: `${Math.max(0, (r.value / maxStage) * 100)}%`, height: 9, borderRadius: 2, backgroundColor: t.colors.series[i] }} />
              )}
            </View>
            <Text style={s.barValue}>{r.withheld ? "Withheld" : formatKg(r.value)}</Text>
          </View>
        ))}

        <Text style={s.h2}>System boundary</Text>
        <View style={s.flow}>
          {[
            ["Raw materials", "A1"],
            ["Inbound transport", "A2"],
            ["Manufacturing", "A3: energy, packaging, waste"],
            [d.method.boundary === "cradle_to_grave" ? "Use and end of life" : "Factory gate", d.method.boundary === "cradle_to_grave" ? "B–C" : "Boundary ends here"],
          ].map(([title, sub], i, all) => (
            <View key={title} style={{ flexDirection: "row", flex: 1, alignItems: "center" }}>
              <View style={s.flowBox}>
                <Text style={s.flowTitle}>{title}</Text>
                <Text style={s.flowSub}>{sub}</Text>
              </View>
              {i < all.length - 1 && <Text style={s.flowArrow}>{">"}</Text>}
            </View>
          ))}
        </View>

        <Text style={s.h2}>Method</Text>
        <Meta
          s={s}
          rows={[
            ["Reference period", period],
            ["Standard", standardLabel(d.method.standard)],
            ["Product category rules", d.method.pcr || "None"],
            ["Boundary", boundaryLabel(d.method.boundary)],
          ]}
        />
        <Footer s={s} label={footer} />
      </Page>

      <Page size="A4" style={s.page}>
        <Watermark s={s} show={d.draft} />
        <Text style={s.h1}>Inputs and data quality</Text>
        {d.licensed_values_withheld && (
          <Text style={s.note}>
            Values from licensed (ecoinvent) factors are withheld, along with the stage totals and data-quality figures they would reveal. The product total includes them.
          </Text>
        )}
        <Table
          s={s}
          headers={["Stage", "Input", "Data", `${CO2} per unit`]}
          widths={[22, 43, 13, 22]}
          numeric={[3]}
          rows={d.lines.map((l) => [
            stages.find((st) => st.id === l.stage)?.label ?? l.stage,
            l.name,
            l.data_type === "primary" ? "Primary" : "Secondary",
            l.value_hidden ? "Withheld" : formatKg(l.kgco2e_per_unit),
          ])}
        />

        <Text style={s.h2}>Data quality</Text>
        <Meta
          s={s}
          rows={[
            ["Primary data share", formatPct(d.primary_data_share_pct)],
            [
              "DQR (1 best, 3 worst)",
              d.dqr
                ? `${d.dqr.overall.toFixed(2)} overall · technology ${d.dqr.technology.toFixed(2)} · geography ${d.dqr.geography.toFixed(2)} · time ${d.dqr.time.toFixed(2)}`
                : "—",
            ],
            [
              "Cut-off",
              d.cut_off
                ? `Rule ${d.method.cut_off_rule_pct}% per item. Items below it ${d.cut_off.below_threshold_total_pct === null ? "are" : `make up ${formatPct(d.cut_off.below_threshold_total_pct, 2)} of the total,`} ${d.cut_off.within_limit ? "within" : "above"} the 5% limit, and stay in the total.`
                : `Rule ${d.method.cut_off_rule_pct}% per item`,
            ],
            [
              "Allocation",
              d.method.allocation_share_pct === null
                ? "No plant energy allocated"
                : `Plant Scope 1 and 2 by ${allocationLabel(d.method.allocation_key)}; this product's share ${formatPct(d.method.allocation_share_pct, 2)}`,
            ],
          ]}
        />

        {d.factor_sources.length > 0 && (
          <>
            <Text style={s.h2}>Secondary data sources</Text>
            <Text>{d.factor_sources.map((f) => (f.version === "unspecified" ? f.name : `${f.name} (${f.version})`)).join(", ")}</Text>
          </>
        )}

        <Text style={s.h2}>Method notes and verification</Text>
        <Meta
          s={s}
          rows={[
            ["Verification", verified],
            ["Calculated", `${dateText(d.calculated_at)} · engine ${d.engine_version}`],
            ["Biogenic carbon", "Not modelled; the whole total is fossil"],
            ["PACT id", d.pact_id],
          ]}
        />
        {d.warnings.length > 0 && (
          <View style={s.callout} wrap={false}>
            {d.warnings.map((w) => (
              <Text key={w} style={{ marginBottom: 2 }}>
                {w}
              </Text>
            ))}
          </View>
        )}
        {d.draft && (
          <View style={s.callout} wrap={false}>
            <Text>This footprint is not approved. Do not share it as a final declaration.</Text>
          </View>
        )}
        <Footer s={s} label={footer} />
      </Page>
    </Document>
  );
}

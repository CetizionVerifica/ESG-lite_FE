import { Defs, Document, Image, LinearGradient, Page, Rect, StyleSheet, Stop, Svg, Text, View } from "@react-pdf/renderer";
import type { PdfTheme } from "../../../theme";
import { POWERED_BY_TEXT, formatNumber, formatPercent } from "../../../ui";
import { PATHWAYS, type Pathway, type Rule, type TargetModel, latestScored, statusWord, yearsLeft } from "../logic";

export type TargetsPdfProps = {
  theme: PdfTheme;
  model: TargetModel;
  pathway: Pathway;
  siteNames: string[];
  rules: Rule[];
  generatedAt: Date;
};

/** One-page (or two, for long pathways) summary of the current target, on the client's print theme. */
export function TargetsPdf({ theme, model: m, pathway, siteNames, rules, generatedAt }: TargetsPdfProps) {
  const c = theme.colors;
  const s = StyleSheet.create({
    page: { padding: 32, paddingTop: 0, fontFamily: theme.fonts.ui, fontSize: 9, color: c.ink, backgroundColor: c.paper },
    band: { marginHorizontal: -32, height: 84, position: "relative", marginBottom: 16 },
    bandText: { position: "absolute", left: 32, right: 32, top: 22, color: theme.cover.text },
    h1: { fontSize: 18, fontWeight: 700 },
    sub: { fontSize: 9, marginTop: 4 },
    logo: { position: "absolute", right: 32, top: 20, height: 40, maxWidth: 120, objectFit: "contain" },
    h2: { fontSize: 11, fontWeight: 700, marginTop: 14, marginBottom: 6, color: c.brandText },
    kpis: { flexDirection: "row", borderWidth: 1, borderColor: c.line, borderRadius: 4 },
    kpi: { flex: 1, padding: 8, borderRightWidth: 1, borderColor: c.line },
    kpiLabel: { fontSize: 7, color: c.muted },
    kpiValue: { fontSize: 12, fontFamily: theme.fonts.num, marginTop: 3 },
    rule: { flexDirection: "row", marginBottom: 4 },
    dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2, marginRight: 6 },
    muted: { color: c.muted },
    row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: c.line, paddingVertical: 2.5 },
    head: { flexDirection: "row", backgroundColor: c.tint, paddingVertical: 3 },
    cell: { flex: 1, textAlign: "right", fontFamily: theme.fonts.num, paddingRight: 4 },
    cellL: { flex: 1, paddingLeft: 4 },
    footer: { position: "absolute", bottom: 16, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: c.muted },
  });
  const latest = latestScored(m.actual);
  const actualBy = new Map(m.actual.map((r) => [r.year, r]));
  const setup =
    m.kind === "near"
      ? `Near-term, ${m.baseYear}–${m.targetYear}, ${PATHWAYS[pathway].label} pathway (${m.annualRatePct}% a year)`
      : `Net-zero ${m.targetYear}, 90% cut from ${m.baseYear} (${m.annualRatePct}% a year)`;
  const kpis: Array<[string, string]> = [
    [`Base emissions ${m.baseYear}`, `${formatNumber(m.boundaryBase, 1)} t`],
    [`Target ${m.targetYear}`, `${formatNumber(m.targetEmissions, 1)} t`],
    [latest ? `Actual ${latest.year} · ${statusWord(latest.status)}` : "Latest actual", latest ? `${formatNumber(latest.actual, 1)} t` : "No data"],
    ["Annual rate", `${m.annualRatePct}%`],
    ["Years left", String(yearsLeft(m.targetYear, generatedAt))],
  ];
  const dotColour = { ok: c.good, warn: c.warn, info: c.info } as const;

  return (
    <Document title={`Targets ${m.baseYear}-${m.targetYear}`} author={theme.name}>
      <Page size="A4" style={s.page}>
        <View style={s.band} fixed>
          <Svg width="100%" height={84} style={{ position: "absolute", top: 0, left: 0 }}>
            <Defs>
              <LinearGradient id="cover" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={theme.cover.from} />
                <Stop offset="1" stopColor={theme.cover.to} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="600" height={84} fill="url(#cover)" />
          </Svg>
          <View style={s.bandText}>
            <Text style={s.h1}>Science-based target</Text>
            <Text style={s.sub}>{siteNames.join(", ")}</Text>
          </View>
          {theme.logoUrl && <Image src={theme.logoUrl} style={s.logo} />}
        </View>

        <Text>{setup}</Text>

        <View style={[s.kpis, { marginTop: 10 }]}>
          {kpis.map(([label, value], i) => (
            <View key={label} style={i === kpis.length - 1 ? [s.kpi, { borderRightWidth: 0 }] : s.kpi}>
              <Text style={s.kpiLabel}>{label}</Text>
              <Text style={s.kpiValue}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>SBTi rules check</Text>
        {rules.map((r) => (
          <View key={r.id} style={s.rule} wrap={false}>
            <View style={[s.dot, { backgroundColor: dotColour[r.state] }]} />
            <View style={{ flex: 1 }}>
              <Text>{r.title}</Text>
              <Text style={s.muted}>{r.detail}</Text>
            </View>
          </View>
        ))}

        <Text style={s.h2}>Pathway</Text>
        <View style={s.head}>
          <Text style={s.cellL}>Year</Text>
          <Text style={s.cell}>Target tCO2e</Text>
          <Text style={s.cell}>Total reduction</Text>
          <Text style={s.cell}>Actual tCO2e</Text>
          <Text style={s.cell}>Status</Text>
        </View>
        {m.pathway.map((r) => {
          const a = actualBy.get(r.year);
          return (
            <View key={r.year} style={s.row} wrap={false}>
              <Text style={s.cellL}>{r.year}</Text>
              <Text style={s.cell}>{formatNumber(r.target, 3)}</Text>
              <Text style={s.cell}>{formatPercent(r.totalReductionPct, 2)}</Text>
              <Text style={s.cell}>{formatNumber(a?.actual ?? null, 3)}</Text>
              <Text style={[s.cell, { fontFamily: theme.fonts.ui }]}>{a ? statusWord(a.status) : "—"}</Text>
            </View>
          );
        })}

        <View style={s.footer} fixed>
          <Text>
            Approved emissions only · generated {generatedAt.toISOString().slice(0, 10)}
          </Text>
          <Text>{POWERED_BY_TEXT}</Text>
        </View>
      </Page>
    </Document>
  );
}

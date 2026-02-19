

import { Image, Page, Text, View } from "@react-pdf/renderer";
import { pdfStyles as s } from "../PdfShared";

function pct(n: number) {
  const v = Number(n);
  return `${(Number.isFinite(v) ? v : 0).toFixed(2)}%`;
}

function FigureBlock({
  title,
  description,
  img,
  caption,
  height = 360, 
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

export default function PdfResultsConclusion({
  companyName,
  compareName,
  selectedName,
  imgResultsPct,
  topSelectedCategory,
  topSelectedPct,
  topCompareCategory,
  topComparePct,
}: {
  companyName: string;
  compareName: string;
  selectedName: string;
  imgResultsPct: string;
  topSelectedCategory: string;
  topSelectedPct: number;
  topCompareCategory: string;
  topComparePct: number;
}) {
  const selectedCat = topSelectedCategory || "the highest-ranked category";
  const compareCat = topCompareCategory || "the highest-ranked category";

  const sameTop = Boolean(topSelectedCategory && topCompareCategory) && selectedCat === compareCat;

  const topStatement = sameTop
    ? `The top contributing category remained consistent across both periods, indicating a persistent primary driver within the reporting boundary.`
    : `The leading category differs between periods, which may indicate a change in operational drivers, activity levels, boundary coverage, or emission factors.`;

  return (
    <>
      <Page size="A4" style={s.page}>
        <Text style={s.h2}>RESULTS</Text>

        <View style={s.card}>
          <Text style={s.p}>
            This section summarizes the year-over-year distribution of emissions by category as a percentage of total emissions. The intent is to
            highlight material drivers within the reporting boundary and provide a clear basis for prioritizing reduction actions.
          </Text>

          <View style={{ height: 8 }} />

          <Text style={s.p}>
            Interpretation note: percentage shares can change due to real operational movement (consumption, production, logistics, refrigerant losses),
            as well as changes in data completeness, categorization, boundary, or emission factors.
          </Text>
        </View>

        <FigureBlock
          img={imgResultsPct}
          height={360}
          caption="Figure 6: Emissions by Category (%) (YoY Comparison)"
          title="Category Contribution to Total Emissions"
          description="The chart below compares category shares between the two reporting periods. Focus on the largest segments and any categories that show clear increases, as these typically represent the best opportunities for targeted interventions."
        />

        <View style={{ height: 6 }} />

        <View style={s.cardTight} wrap={false}>
          <Text style={[s.p, { fontWeight: 700, marginBottom: 6 }]}>Key findings</Text>

          <Text style={s.p}>
            • In <Text style={{ fontWeight: 700 }}>{selectedName}</Text>, the largest contributing category was{" "}
            <Text style={{ fontWeight: 700 }}>{selectedCat}</Text>, representing <Text style={{ fontWeight: 700 }}>{pct(topSelectedPct)}</Text> of
            total emissions.
          </Text>

          <Text style={[s.p, { marginTop: 4 }]}>
            • In <Text style={{ fontWeight: 700 }}>{compareName}</Text>, the largest contributing category was{" "}
            <Text style={{ fontWeight: 700 }}>{compareCat}</Text>, representing <Text style={{ fontWeight: 700 }}>{pct(topComparePct)}</Text> of
            total emissions.
          </Text>

          <Text style={[s.p, { marginTop: 6 }]}>{`• ${topStatement}`}</Text>

          <Text style={[s.p, { marginTop: 6 }]}>
            • Management focus should prioritize the top category and the next-highest contributors, as these typically drive the majority of absolute
            emissions and deliver the greatest return for reduction planning.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footText}>{companyName}</Text>
          <Text style={s.footText}>Results</Text>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Conclusion</Text>

        <View style={s.card}>
          <Text style={s.p}>
            This report provides a structured view of emissions across the selected reporting periods, including totals and distributions by scope and
            category. It supports transparency and internal decision-making by making the major emission drivers visible and comparable year over year.
          </Text>

          <View style={{ height: 8 }} />

          <Text style={s.p}>
            The next step is to translate the identified drivers into an action plan—targeting the most material categories first, strengthening data
            quality where uncertainty is highest, and tracking progress consistently over time.
          </Text>
        </View>

        <View style={s.cardTight} wrap={false}>
          <Text style={[s.p, { fontWeight: 700, marginBottom: 6 }]}>Recommended actions</Text>

          <Text style={s.p}>• Prioritize reduction initiatives for the top contributing categories identified in the Results section.</Text>
          <Text style={[s.p, { marginTop: 4 }]}>
            • Validate year-over-year changes by checking activity data completeness, classification consistency, and any updated emission factors.
          </Text>
          <Text style={[s.p, { marginTop: 4 }]}>
            • Improve audit readiness by standardizing data capture (owners, frequency, units), retaining evidence, and documenting assumptions.
          </Text>
          <Text style={[s.p, { marginTop: 4 }]}>
            • Establish a repeatable review cadence (monthly/quarterly) to monitor performance and trigger investigations when variances exceed defined
            thresholds.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footText}>{companyName}</Text>
          <Text style={s.footText}>Conclusion</Text>
        </View>
      </Page>
    </>
  );
}

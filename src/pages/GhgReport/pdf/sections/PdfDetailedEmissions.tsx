

import { Image, Page, Text, View } from "@react-pdf/renderer";
import type { GhgReportDetailsResponse } from "../../../../services/ghgreportService";
import { chunk, EXCLUDED_CATEGORIES, fmt, num, pdfStyles as s } from "../PdfShared";

function ScopeDetailTables({
  title,
  rows,
  compareYear,
  selectedYear,
}: {
  title: string;
  rows: any[];
  compareYear: number;
  selectedYear: number;
}) {
  const displayRows = (rows || []).filter((r) => !EXCLUDED_CATEGORIES.includes(String(r.categoryName || "")));
  const pages = chunk(displayRows, 18);

  const colW = { cat: "24%", loc: "26%", fuel: "18%", cEm: "16%", sEm: "16%" } as const;
  const cell = (w: any, extra?: any) => [{ width: w }, extra].filter(Boolean);

  return (
    <>
      {pages.map((pageRows, pageIdx) => (
        <View key={`${title}-${pageIdx}`} style={s.cardTight} wrap={false}>
          <Text style={s.h3}>{pages.length > 1 ? `${title} (Part ${pageIdx + 1} of ${pages.length})` : title}</Text>

          <View style={s.table}>
            <View style={s.trHead}>
              <Text style={[s.th, ...cell(colW.cat), s.cellBorder]}>Category</Text>
              <Text style={[s.th, ...cell(colW.loc), s.cellBorder]}>Location</Text>
              <Text style={[s.th, ...cell(colW.fuel), s.cellBorder]}>Emission Category</Text>
              <Text style={[s.th, ...cell(colW.cEm), s.cellBorder, s.right]}>{`${compareYear} Emissions (tCO₂e)`}</Text>
              <Text style={[s.th, ...cell(colW.sEm), s.right]}>{`${selectedYear} Emissions (tCO₂e)`}</Text>
            </View>

            {pageRows.map((r: any, idx: number) => (
              <View
                key={`${r.scope}-${r.categoryId}-${r.siteId}-${r.fuelType}-${idx}`}
                style={idx === 0 ? s.tr : [s.tr, s.rowBorder]}
              >
                <Text style={[s.td, ...cell(colW.cat), s.cellBorder]}>{String(r.categoryName || "")}</Text>
                <Text style={[s.td, ...cell(colW.loc), s.cellBorder]}>{String(r.siteName || "")}</Text>
                <Text style={[s.td, ...cell(colW.fuel), s.cellBorder]}>{String(r.fuelType || "")}</Text>
                <Text style={[s.td, ...cell(colW.cEm), s.cellBorder, s.right]}>{fmt(num(r.compare?.emissions))}</Text>
                <Text style={[s.td, ...cell(colW.sEm), s.right]}>{fmt(num(r.selected?.emissions))}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

/** Framed, print-friendly chart block (same style as improved Executive Summary) */
function FigureBlock({
  title,
  description,
  img,
  caption,
  height = 320,
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

function MethodologyIntro({
  compareLabel,
  selectedLabel,
}: {
  compareLabel: string;
  selectedLabel: string;
}) {
  return (
    <View style={s.card}>
      <Text style={s.h3}>Carbon Accounting Objectives</Text>
      <View style={{ marginTop: 6 }}>
        <Text style={s.p}>The carbon accounting report aims to:</Text>
        <View style={{ marginTop: 6, paddingLeft: 10 }}>
          <Text style={s.p}>• Quantify and report Scope 1, Scope 2, and relevant Scope 3 GHG emissions for the selected periods.</Text>
          <Text style={s.p}>• Support alignment with climate reporting frameworks and voluntary initiatives where applicable.</Text>
          <Text style={s.p}>
            • Enable management review by highlighting key emission sources, trends, and year-over-year changes ({compareLabel} vs. {selectedLabel}).
          </Text>
        </View>
      </View>

      <View style={{ height: 10 }} />

      <Text style={s.h3}>Boundaries and Scope Definitions</Text>
      <Text style={[s.p, { marginTop: 6 }]}>
        The inventory is organized using the GHG Protocol approach. Emissions are reported by scope:
      </Text>
      <View style={{ marginTop: 6, paddingLeft: 10 }}>
        <Text style={s.p}>
          • <Text style={{ fontWeight: 700 }}>Scope 1 (Direct):</Text> Emissions from sources owned or controlled by the organization (e.g., fuel combustion,
          process emissions, refrigerants).
        </Text>
        <Text style={s.p}>
          • <Text style={{ fontWeight: 700 }}>Scope 2 (Indirect):</Text> Emissions from purchased electricity, steam, heat, or cooling consumed by the organization.
        </Text>
        <Text style={s.p}>
          • <Text style={{ fontWeight: 700 }}>Scope 3 (Other Indirect):</Text> Emissions occurring in the value chain outside organizational control (e.g., purchased goods,
          transport, waste, business travel, commuting), where included in the inventory boundary.
        </Text>
      </View>

      <View style={{ height: 10 }} />

      <Text style={s.h3}>Data Collection and Quantification</Text>
      <Text style={[s.p, { marginTop: 6 }]}>
        Activity data is collected by category and location. Emissions are calculated by applying appropriate emission factors and converting gases to CO₂e
        using recognized global warming potentials. Results are presented in metric tons of carbon dioxide equivalent (tCO₂e).
      </Text>

      <View style={{ height: 10 }} />

      <Text style={s.h3}>Principles of Carbon Accounting</Text>
      <View style={{ marginTop: 6 }}>
        <Text style={s.p}>
          <Text style={{ fontWeight: 700 }}>Relevance:</Text> The inventory supports decision-making and reflects material emission sources.
        </Text>
        <Text style={s.p}>
          <Text style={{ fontWeight: 700 }}>Completeness:</Text> All relevant emission sources within the defined boundary are included.
        </Text>
        <Text style={s.p}>
          <Text style={{ fontWeight: 700 }}>Consistency:</Text> Methods and assumptions are applied consistently to support comparability over time.
        </Text>
        <Text style={s.p}>
          <Text style={{ fontWeight: 700 }}>Transparency:</Text> Assumptions and calculation approaches are documented to enable review.
        </Text>
        <Text style={s.p}>
          <Text style={{ fontWeight: 700 }}>Accuracy:</Text> Uncertainty is reduced as far as practical through validation and appropriate factors.
        </Text>
      </View>
    </View>
  );
}

export default function PdfDetailedEmissions({
  companyName,
  detailsData,
  compareLabel,
  selectedLabel,
  compareYear,
  selectedYear,
  imgScope1Pct,
  imgScope2Pct,
  imgScope3Pct,
}: {
  companyName: string;
  detailsData: GhgReportDetailsResponse;
  compareLabel: string;
  selectedLabel: string;
  compareYear: number;
  selectedYear: number;
  imgScope1Pct: string;
  imgScope2Pct: string;
  imgScope3Pct: string;
}) {
  const scope1Rows = (detailsData.rows || []).filter((r: any) => r.scope === "Scope 1");
  const scope2Rows = (detailsData.rows || []).filter((r: any) => r.scope === "Scope 2");
  const scope3Rows = (detailsData.rows || []).filter((r: any) => r.scope === "Scope 3");

  return (
    <>
      {/* PAGE 1: Intro + Scope 1 */}
      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Detailed Emissions</Text>

        {/* NEW: professional narrative section before the tables */}
        <MethodologyIntro compareLabel={compareLabel} selectedLabel={selectedLabel} />

        <View style={s.card}>
          <Text style={s.p}>
            The tables below provide a detailed breakdown by scope, location, and emission category for {compareLabel} and {selectedLabel}. The
            accompanying charts show each scope’s internal distribution by category as a percentage of that scope total, which helps identify the primary
            drivers and focus areas for reduction planning.
          </Text>
        </View>

        <ScopeDetailTables
          title={`Direct GHG Emissions: Scope 1 — ${compareLabel} & ${selectedLabel}`}
          rows={scope1Rows}
          compareYear={compareYear}
          selectedYear={selectedYear}
        />

        <FigureBlock
          img={imgScope1Pct}
          height={320}
          caption="Figure 3: Scope 1 Emissions by Category (%) (YoY Comparison)"
          title="Scope 1 Category Distribution"
          description="This chart shows how Scope 1 emissions are distributed across direct sources (e.g., stationary combustion, mobile combustion, fugitive emissions). Use this view to identify high-impact sources for operational controls, maintenance programs, and fuel efficiency initiatives."
        />

        <View style={s.footer} fixed>
          <Text style={s.footText}>{companyName}</Text>
          {/* <Text style={s.footText}>Detailed Emissions</Text> */}
            <Text
    style={s.footText}
    render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
  />
        </View>
      </Page>

      {/* PAGE 2: Scope 2 */}
      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Detailed Emissions</Text>

        <ScopeDetailTables
          title={`Indirect GHG Emissions: Scope 2 — ${compareLabel} & ${selectedLabel}`}
          rows={scope2Rows}
          compareYear={compareYear}
          selectedYear={selectedYear}
        />

        <FigureBlock
          img={imgScope2Pct}
          height={320}
          caption="Figure 4: Scope 2 Emissions by Category (%) (YoY Comparison)"
          title="Scope 2 Category Distribution"
          description="This chart summarizes the category split within Scope 2 (purchased electricity/energy). Interpretation should consider the applied approach (location-based and/or market-based, where relevant) and changes in consumption, grid factors, or procurement instruments."
        />

        <View style={s.footer} fixed>
          <Text style={s.footText}>{companyName}</Text>
            <Text
    style={s.footText}
    render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
  />
          {/* <Text style={s.footText}>Detailed Emissions</Text> */}
        </View>
      </Page>

      {/* PAGE 3: Scope 3 */}
      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Detailed Emissions</Text>

        <ScopeDetailTables
          title={`Indirect GHG Emissions: Scope 3 — ${compareLabel} & ${selectedLabel}`}
          rows={scope3Rows}
          compareYear={compareYear}
          selectedYear={selectedYear}
        />

        <FigureBlock
          img={imgScope3Pct}
          height={320}
          caption="Figure 5: Scope 3 Emissions by Category (%) (YoY Comparison)"
          title="Scope 3 Category Distribution"
          description="This chart highlights the Scope 3 category mix (value-chain emissions). It is typically the most assumption-driven scope; year-over-year movement may reflect changes in supplier data quality, spend/activity levels, boundary updates, or emission factor updates."
        />

        <View style={s.footer} fixed>
          <Text style={s.footText}>{companyName}</Text>
          {/* <Text style={s.footText}>Detailed Emissions</Text> */}
           <Text
    style={s.footText}
    render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
  />
        </View>

      </Page>
    </>
  );
}



import { Page, Text, View } from "@react-pdf/renderer";
import { pdfStyles as s } from "../PdfShared";

export default function PdfIntroduction({
  companyName,
  compareLabel,
  selectedLabel,
}: {
  companyName: string;
  compareLabel: string;
  selectedLabel: string;
}) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.h2}>Introduction</Text>

      <View style={s.card}>
        <Text style={s.p}>
          This report presents greenhouse gas (GHG) emissions results for the selected reporting periods. It is intended to support internal
          review, external reporting readiness, and ongoing improvement of activity data completeness and quality.
        </Text>
        <Text style={[s.p, { marginTop: 8 }]}>
          Reporting Periods: {compareLabel} and {selectedLabel}. Emissions are summarized by Scope 1 (Direct), Scope 2 (Energy Indirect),
          and Scope 3 (Other Indirect) where data is available.
        </Text>
      </View>

      <Text style={s.h3}>Scope Definitions</Text>
      <View style={s.cardTight}>
        <Text style={s.p}>• Scope 1: Direct emissions from sources owned or controlled by the organization (e.g., fuel combustion, fugitive gases).</Text>
        <Text style={[s.p, { marginTop: 4 }]}>• Scope 2: Indirect emissions from purchased energy (e.g., electricity, steam, heating, cooling).</Text>
        <Text style={[s.p, { marginTop: 4 }]}>
          • Scope 3: Other indirect emissions that occur in the value chain (e.g., purchased goods & services, transport & distribution, waste,
          employee commuting).
        </Text>
      </View>

      <Text style={s.h3}>Notes on Data and Assumptions</Text>
      <View style={s.cardTight}>
        <Text style={s.p}>
          The results shown are based on the activity data provided for the selected sites and categories. Where a scope or category has no
          reported activity, it may appear as zero. Emissions factors and unit conversions are applied consistently within the reporting run to
          support comparability across periods.
        </Text>
      </View>

      <View style={s.footer} fixed>
        <Text style={s.footText}>{companyName}</Text>
        <Text style={s.footText}>Introduction</Text>
      </View>
    </Page>
  );
}

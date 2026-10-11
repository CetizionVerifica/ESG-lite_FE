/**
 * Plain-language definitions of ESG and app terms, shown by InfoTerm / InfoTip.
 * Keys are stable ids shared with the i18n termbase (/mnt/project-files/i18n/01-glossary.md); never rename one
 * when wording changes. Definitions stay at or under 160 characters, no jargon inside a definition. Add a term here once and every
 * KPI label, table header, chart title, field label or page title with that exact
 * text (or an alias) gets the info icon.
 */
export type GlossaryEntry = {
  /** How the term is written in the UI. */
  term: string;
  /** Other UI spellings that mean the same term (matched case-insensitively). */
  aliases?: string[];
  definition: string;
  /** Only shown where a page asks for it (InfoTerm id="…"), never matched from a label automatically. */
  manual?: boolean;
};

export const GLOSSARY = {
  scope1: {
    term: "Scope 1",
    definition: "Direct emissions from sources your company owns or controls, such as fuel burned in boilers, generators and vehicles, and refrigerant leaks.",
  },
  scope2: {
    term: "Scope 2",
    definition: "Indirect emissions from the electricity, steam, heat and cooling your company buys and uses.",
  },
  scope3: {
    term: "Scope 3",
    definition: "All other indirect emissions in your value chain, such as purchased goods, transport, business travel and waste.",
  },
  tco2e: {
    term: "tCO₂e",
    aliases: ["tCO2e", "tonnes CO₂e"],
    definition:
      "Tonnes of carbon dioxide equivalent. Every greenhouse gas is converted to the amount of CO₂ that would warm the planet as much, so all gases can be added up.",
  },
  kgco2e: {
    term: "kgCO₂e per unit",
    aliases: ["kgCO2e per unit", "kgCO₂e"],
    definition: "Kilograms of CO₂ equivalent for one declared unit of the product. 1,000 kg = 1 tonne.",
  },
  ghg: {
    term: "GHG",
    aliases: ["Greenhouse gas", "GHG report"],
    definition: "Greenhouse gases: CO₂, methane, nitrous oxide and other gases that trap heat in the atmosphere. Reports follow the GHG Protocol.",
  },
  emissionFactor: {
    term: "Emission factor",
    aliases: ["Emission factors", "Factor"],
    definition:
      "A number that turns an activity into emissions, for example kg CO₂e per litre of diesel or per kWh of electricity. Activity × emission factor = emissions.",
  },
  activityData: {
    term: "Activity data",
    definition: "The measured amount of an activity that causes emissions, such as litres of fuel, kWh of electricity or km travelled.",
  },
  dataCoverage: {
    term: "Data coverage",
    definition: "The share of the selected sites that reported data for this period. Low coverage means the totals may be incomplete.",
  },
  intensity: {
    term: "Intensity",
    aliases: ["Emission intensity"],
    definition:
      "Emissions per unit of production, such as tCO₂e per tonne of product. It lets you compare periods even when output changes. Uses approved data only.",
  },
  gross: {
    term: "Gross",
    aliases: ["Gross emissions"],
    definition: "Total Scope 1, 2 and 3 emissions before subtracting anything saved by renewable energy.",
  },
  net: {
    term: "Net emissions",
    definition: "Gross emissions minus the emissions avoided by using renewable energy.",
  },
  saved: {
    term: "Saved (renewables)",
    definition: "Emissions avoided because part of your energy came from renewable sources, such as solar panels or a green power contract.",
  },
  largestSource: {
    term: "Largest source",
    definition: "The emission category with the biggest share of the total for this period.",
  },
  fera: {
    term: "FERA",
    definition:
      "Fuel- and energy-related activities: emissions from producing and delivering the fuel and power you use. Scope 3, added automatically on save.",
  },
  threshold: {
    term: "Threshold",
    aliases: ["Threshold %", "Above threshold"],
    definition: "The percentage change from last month above which a category is flagged for attention (between 2% and 5%, default 5%).",
  },
  baseYear: {
    term: "Base year",
    definition: "The reference year that targets and reductions are measured against.",
  },
  sbti: {
    term: "SBTi",
    aliases: ["Science Based Targets"],
    definition:
      "Science Based Targets initiative. It sets rules for emission reduction targets that are in line with climate science, such as limiting warming to 1.5 °C.",
  },
  pathway: {
    term: "Pathway",
    aliases: ["Target pathway"],
    definition: "The year-by-year emissions a target allows, from the base year down to the target year.",
  },
  edeReport: {
    term: "EDE report",
    definition: "Emissions Data Entry report: an operational view of approved data by site and month, with renewables and intensity.",
  },
  pcf: {
    term: "PCF",
    aliases: ["Product carbon footprint", "Product footprints", "Product footprint"],
    definition: "Product carbon footprint: the emissions of one declared unit of a product. In ESGLite: from raw materials to the factory gate.",
  },
  cradleToGate: {
    term: "Cradle-to-gate",
    definition: "A footprint that covers raw materials, transport and manufacturing until the product leaves your factory. Use and disposal are not included.",
  },
  declaredUnit: {
    term: "Declared unit",
    definition: "The amount of product a footprint refers to, for example 1 kg or 1 piece.",
  },
  primaryData: {
    term: "Primary data",
    aliases: ["Primary data share"],
    definition: "Data measured at your own sites or given by your suppliers, rather than average values taken from a database.",
  },
  allocation: {
    term: "Allocation",
    aliases: ["Plant energy allocated"],
    definition: "How shared emissions, such as a plant's energy use, are split between the products made there, usually by mass or by value.",
  },
  pcr: {
    term: "PCR",
    definition: "Product category rules: agreed rules for how footprints of one type of product are calculated, so they can be compared.",
  },
  gwp: {
    term: "GWP set",
    aliases: ["GWP"],
    definition:
      "Global warming potential: how much a gas warms the planet compared with the same mass of CO₂. AR5 and AR6 are the IPCC report editions the values come from.",
  },
  overlap: {
    term: "Overlap",
    aliases: ["Overlaps"],
    definition: "Two production records for the same product and site cover some of the same days, so that output may be counted twice.",
  },
  status: {
    manual: true,
    term: "Status",
    definition: "Pending: waiting for a reviewer. Approved: checked and counted in reports. Rejected: sent back with a reason to fix. Only approved data counts in totals.",
  },
  "status.pending": {
    manual: true,
    term: "Pending",
    definition: "Submitted and waiting for a reviewer. Pending data is not counted in reports yet.",
  },
  "status.approved": {
    manual: true,
    term: "Approved",
    definition: "Checked by a reviewer and counted in totals and reports.",
  },
  "status.rejected": {
    manual: true,
    term: "Rejected",
    definition: "Sent back by a reviewer with a reason. Fix it and submit again; it isn't counted until approved.",
  },
  "status.missing": {
    manual: true,
    term: "Missing",
    definition: "Nothing has been entered yet for this category and period.",
  },
  "status.draft": {
    manual: true,
    term: "Draft",
    definition: "Saved but not submitted. Only you can see it until you submit it for review.",
  },
} satisfies Record<string, GlossaryEntry>;

export type TermKey = keyof typeof GLOSSARY;

const normalise = (s: string) => s.trim().toLowerCase().replace(/co2/g, "co₂").replace(/\s+/g, " ");

const INDEX: Map<string, TermKey> = (() => {
  const m = new Map<string, TermKey>();
  for (const [key, entry] of Object.entries(GLOSSARY) as Array<[TermKey, GlossaryEntry]>) {
    if (entry.manual) continue;
    for (const spelling of [entry.term, ...(entry.aliases ?? [])]) m.set(normalise(spelling), key);
  }
  return m;
})();

/** The glossary key whose term or alias is exactly this label (case-insensitive), or null. Skips manual entries. */
export function findTerm(label: unknown): TermKey | null {
  if (typeof label !== "string") return null;
  return INDEX.get(normalise(label)) ?? null;
}

/** Entry for a key, or for a label that matches a term or alias. */
export function glossaryEntry(keyOrLabel: string): GlossaryEntry | null {
  if (keyOrLabel in GLOSSARY) return GLOSSARY[keyOrLabel as TermKey];
  const key = findTerm(keyOrLabel);
  return key ? GLOSSARY[key] : null;
}

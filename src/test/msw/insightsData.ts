/**
 * IN-0 · Fixture data for the Insights mocks (src/test/msw/insights.ts): an
 * example company with three plants and data from 2021 to 2026, shaped like
 * docs/insights/01-contracts.md §3. The figures are made up for screens and
 * tests; they are not reported figures and nothing computes from them.
 * Each module that changes a shape keeps its fixture here in step.
 */
import type {
  Bridge,
  Cards,
  Completeness,
  Decoupling,
  EsgRing,
  EventRef,
  Flow,
  Materiality,
  Pathway,
  Stripes,
  Summary,
  TargetWall,
} from "../../lib/insights/contracts";

export const MOCK_SITES = [
  { site_id: 11, name: "Chennai plant" },
  { site_id: 12, name: "Nagpur plant" },
  { site_id: 13, name: "Pune plant" },
];

export const MOCK_YEARS = [2021, 2022, 2023, 2024, 2025, 2026];

export const summaryData = (kpiOn: boolean): Summary => ({
  net: { value: 41_280.4, unit: "tCO2e", prior: 44_910.2, change_pct: -8.08, good: true },
  pathway: { status: "at_risk", gap_pct: 3.4, target_year: 2030 },
  intensity: { value: 0.612, unit: "t", combined: false, change_pct: -11.3, good: true },
  readiness: kpiOn ? { pct: 68.5, by_pillar: { environment: 81.2, social: 62.0, governance: 54.5 } } : null,
  renewable_share_pct: kpiOn ? undefined : 46.6,
  attention: {
    total: kpiOn ? 19 : 12,
    items: [
      { kind: "approvals", count: 12, link: "/data/approvals" },
      ...(kpiOn
        ? [
            { kind: "kpi_gaps" as const, count: 4, link: "/kpi/dashboard" },
            { kind: "off_track" as const, count: 3, link: "/kpi/targets" },
          ]
        : []),
    ],
  },
});

export const esgRingData: EsgRing = {
  pct: 68.5,
  pillars: [
    {
      pillar: "environment",
      label: "Environment",
      kpis: 16,
      approved: 13,
      coverage_pct: 81.2,
      topics: [
        { topic: "climate", label: "Climate", kpis: 6, approved: 6, coverage_pct: 100, auto_share: 83.3 },
        { topic: "energy", label: "Energy", kpis: 4, approved: 3, coverage_pct: 75, auto_share: 50 },
        { topic: "water", label: "Water", kpis: 3, approved: 2, coverage_pct: 66.7, auto_share: 0 },
        { topic: "waste", label: "Waste", kpis: 3, approved: 2, coverage_pct: 66.7, auto_share: 0 },
      ],
    },
    {
      pillar: "social",
      label: "Social",
      kpis: 13,
      approved: 8,
      coverage_pct: 62.0,
      topics: [
        { topic: "workforce", label: "Workforce", kpis: 5, approved: 4, coverage_pct: 80, auto_share: 0 },
        { topic: "health_safety", label: "Health and safety", kpis: 4, approved: 2, coverage_pct: 50, auto_share: 0 },
        { topic: "training", label: "Training", kpis: 4, approved: 2, coverage_pct: 50, auto_share: 0 },
      ],
    },
    {
      pillar: "governance",
      label: "Governance",
      kpis: 11,
      approved: 6,
      coverage_pct: 54.5,
      topics: [
        { topic: "governance", label: "Board and oversight", kpis: 6, approved: 4, coverage_pct: 66.7, auto_share: 0 },
        { topic: "ethics", label: "Ethics", kpis: 5, approved: 2, coverage_pct: 40, auto_share: 0 },
      ],
    },
  ],
};

export const decouplingData: Decoupling = {
  base_year: 2021,
  years: MOCK_YEARS,
  series: [
    { key: "output", label: "Output", index: [100, 108.2, 117.5, 126.1, 134.9, 142.0], raw: [47_100, 50_960, 55_340, 59_390, 63_540, 66_880], unit: "t" },
    { key: "emissions", label: "Emissions", index: [100, 99.1, 95.4, 90.2, 87.6, 80.9], raw: [51_020, 50_560, 48_670, 46_020, 44_910, 41_280], unit: "tCO2e" },
    { key: "intensity", label: "Intensity", index: [100, 91.6, 81.2, 71.5, 64.9, 57.0], raw: [1.083, 0.992, 0.879, 0.775, 0.707, 0.617], unit: "tCO2e/t" },
  ],
  combined_output: false,
  decoupled: true,
  headline: { output_change_pct: 42.0, emissions_change_pct: -19.1, intensity_change_pct: -43.0 },
};

export const targetWallData = (kpiOn: boolean): TargetWall => ({
  items: [
    {
      id: "sbti-near-term",
      source: "sbti",
      pillar: "environment",
      name: "Scope 1 and 2 emissions (SBTi near term)",
      unit: "tCO2e",
      progress_pct: 38.5,
      expected_pct: 45.0,
      status: "at_risk",
      baseline: { year: 2021, value: 51_020 },
      target: { year: 2030, value: 29_590 },
      latest: { year: 2026, value: 41_280 },
      direction_good: "down",
      link: "/targets",
    },
    ...(kpiOn
      ? [
          {
            id: "kpi-41",
            source: "kpi" as const,
            pillar: "social" as const,
            name: "Lost-time injury frequency rate",
            unit: "per million hours",
            progress_pct: 20.0,
            expected_pct: 60.0,
            status: "off_track" as const,
            baseline: { year: 2022, value: 2.5 },
            target: { year: 2027, value: 1.0 },
            latest: { year: 2026, value: 2.2 },
            direction_good: "down" as const,
            link: "/kpi/targets?kpi=41",
          },
          {
            id: "kpi-12",
            source: "kpi" as const,
            pillar: "environment" as const,
            name: "Renewable electricity share",
            unit: "%",
            progress_pct: 72.0,
            expected_pct: 60.0,
            status: "on_track" as const,
            baseline: { year: 2021, value: 12 },
            target: { year: 2030, value: 60 },
            latest: { year: 2026, value: 46.6 },
            direction_good: "up" as const,
            link: "/kpi/targets?kpi=12",
          },
        ]
      : []),
  ],
});

export const cardsData = (kpiOn: boolean): Cards => ({
  cards: [
    { id: "pathway_gap", rule: "pathway_gap", severity: "critical", source: "rule", params: { gap_pct: 3.4, target_year: 2030 }, link: "/targets", panel: "pathway" },
    ...(kpiOn
      ? [{ id: "target_off_track", rule: "target_off_track" as const, severity: "attention" as const, source: "rule" as const, params: { count: 1, first_name: "Lost-time injury frequency rate" }, link: "/kpi/targets", panel: "target_wall" as const }]
      : []),
    { id: "pending_large", rule: "pending_large", severity: "attention", source: "rule", params: { count: 12, link: "/data/approvals" }, link: "/data/approvals" },
    { id: "decoupling", rule: "decoupling", severity: "good", source: "rule", params: { output_pct: 42, emissions_pct: 19, base_year: 2021 }, link: null, panel: "decoupling" },
    { id: "renewables_jump", rule: "renewables_jump", severity: "good", source: "rule", params: { from_pct: 31, to_pct: 47 }, link: null, panel: "pathway" },
    { id: "largest_source", rule: "largest_source", severity: "info", source: "rule", params: { category: "Purchased electricity", share_pct: 44 }, link: "/data/ledger?status=approved", panel: "flow" },
  ],
});

/**
 * IN-9 · The cards with `?ai=1`: the same cards, some reworded (`source: 'ai'`
 * with `{{v:key}}` tokens). `renewables_jump` carries a deliberately invalid
 * text (a digit outside the tokens) that the FE must ignore in favour of the
 * rule copy; the rest stay `source: 'rule'`.
 */
export const AI_CARD_TEXT: Partial<Record<string, string>> = {
  decoupling: "Since {{v:base_year}}, output grew {{v:output_pct}}% and emissions dropped {{v:emissions_pct}}%.",
  pathway_gap: "You're running {{v:gap_pct}}% over the path to your {{v:target_year}} target.",
  largest_source: "{{v:category}} makes up {{v:share_pct}}% of everything you emit.",
  renewables_jump: "Renewables went from {{v:from_pct}}% to {{v:to_pct}}% in 1 year.",
};
export const aiCardsData = (kpiOn: boolean): Cards => ({
  cards: cardsData(kpiOn).cards.map((c) => {
    const text = AI_CARD_TEXT[c.id];
    return text ? { ...c, source: "ai" as const, text } : c;
  }),
});

export const MOCK_EVENTS: EventRef[] = [
  { id: 1, date: "2023-04-01", label: "Rooftop solar at Pune", kind: "initiative", site_id: 13 },
  { id: 2, date: "2024-09-15", label: "Nagpur kiln upgrade", kind: "initiative", site_id: 12 },
  { id: 3, date: "2025-06-01", label: "New grid factors (CEA v20)", kind: "method_change", site_id: null },
];

export const pathwayData = (events: EventRef[]): Pathway => ({
  base_year: 2021,
  target_year: 2030,
  annual_rate_pct: 4.2,
  years: [...MOCK_YEARS, 2027, 2028, 2029, 2030],
  pathway: [51_020, 48_880, 46_830, 44_860, 42_980, 41_170, 39_440, 37_780, 36_190, 29_590],
  actual: {
    s1: [21_400, 21_120, 20_510, 19_880, 19_300, 18_120, null, null, null, null],
    s2: [24_620, 24_260, 23_010, 21_140, 20_550, 18_250, null, null, null, null],
    s3: [5_000, 5_180, 5_150, 5_000, 5_060, 4_910, null, null, null, null],
  },
  levers: [{ key: "renewable_share", label: "Renewable share", unit: "%", values: [12, 18, 24, 31, 38, 46.6, null, null, null, null] }],
  gap_band: [
    { year: 2025, gap: 1_930 },
    { year: 2026, gap: 110 },
  ],
  events,
});

const MONTHS_2026 = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const PCT: Record<number, (number | null)[]> = {
  11: [100, 100, 100, 100, 96, 100, 92, 88, 70, null, null, null],
  12: [100, 100, 96, 100, 100, 90, 84, 80, 52, null, null, null],
  13: [100, 100, 100, 100, 100, 100, 100, 96, 85, null, null, null],
};
export const completenessData: Completeness = {
  months: MONTHS_2026,
  rows: MOCK_SITES.map((s) => ({
    site_id: s.site_id,
    site: s.name,
    cells: MONTHS_2026.map((month, i) => {
      const pct = PCT[s.site_id][i];
      return { month, pct, emissions_expected: pct === null ? 0 : 25, emissions_approved: pct === null ? 0 : Math.round((pct / 100) * 25), kpi_expected: pct === null ? 0 : 0, kpi_approved: 0, link: `/data/ledger?site=${s.site_id}&period=month:${month}` };
    }),
  })),
};

/** Σ steps = to − from exactly (41,280.4 − 44,910.2 = −3,629.8). */
export const bridgeData: Bridge = {
  from: { year: 2025, value: 44_910.2 },
  to: { year: 2026, value: 41_280.4 },
  steps: [
    { driver: "activity", label: "More output", value: 2_330.6, inputs: { output_from: 63_540, output_to: 66_880 } },
    { driver: "intensity_s1", label: "Better process efficiency", value: -2_210.1, inputs: { s1_intensity_from: 0.304, s1_intensity_to: 0.271 } },
    { driver: "energy_intensity_s2", label: "Less electricity per tonne", value: -1_150.4, inputs: { kwh_per_t_from: 412, kwh_per_t_to: 389 } },
    { driver: "grid_and_renewables_s2", label: "Cleaner electricity", value: -2_449.0, inputs: { t_per_kwh_from: 0.00079, t_per_kwh_to: 0.00070 } },
    { driver: "scope3", label: "Supply chain (Scope 3)", value: -150.9, inputs: { s3_from: 5_060, s3_to: 4_910 } },
  ],
  method: "lmdi_additive",
  notes: [],
};

export const flowData = (kpiOn: boolean): Flow => {
  const nodes: Flow["nodes"] = [
    ...MOCK_SITES.map((s) => ({ id: `site:${s.site_id}`, label: s.name, column: 0 as const, kind: "site" as const })),
    { id: "scope:1", label: "Scope 1", column: 1, kind: "scope" },
    { id: "scope:2", label: "Scope 2", column: 1, kind: "scope" },
    { id: "scope:3", label: "Scope 3", column: 1, kind: "scope" },
  ];
  const links: Flow["links"] = [
    { source: "site:11", target: "scope:1", value: 6_100, measure: "tCO2e" },
    { source: "site:11", target: "scope:2", value: 5_900, measure: "tCO2e" },
    { source: "site:12", target: "scope:1", value: 8_020, measure: "tCO2e" },
    { source: "site:12", target: "scope:2", value: 7_650, measure: "tCO2e" },
    { source: "site:13", target: "scope:1", value: 4_000, measure: "tCO2e" },
    { source: "site:13", target: "scope:2", value: 4_700, measure: "tCO2e" },
    { source: "site:13", target: "scope:3", value: 4_910, measure: "tCO2e" },
  ];
  if (!kpiOn) {
    nodes.push({ id: "cat:fuel", label: "Stationary combustion", column: 2, kind: "kpi" }, { id: "cat:elec", label: "Purchased electricity", column: 2, kind: "kpi" }, { id: "cat:goods", label: "Purchased goods", column: 2, kind: "kpi" });
    links.push(
      { source: "scope:1", target: "cat:fuel", value: 18_120, measure: "tCO2e" },
      { source: "scope:2", target: "cat:elec", value: 18_250, measure: "tCO2e" },
      { source: "scope:3", target: "cat:goods", value: 4_910, measure: "tCO2e" },
    );
    return { nodes, links };
  }
  nodes.push(
    { id: "kpi:ghg_s1", label: "Gross Scope 1", column: 2, kind: "kpi" },
    { id: "kpi:ghg_s2", label: "Gross Scope 2 (location)", column: 2, kind: "kpi" },
    { id: "kpi:ghg_s3", label: "Gross Scope 3", column: 2, kind: "kpi" },
    { id: "disc:GRI:305-1", label: "GRI 305-1", column: 3, kind: "disclosure" },
    { id: "disc:BRSR:P6-E7", label: "BRSR P6 E7", column: 3, kind: "disclosure" },
    { id: "disc:ESRS:E1-6", label: "ESRS E1-6", column: 3, kind: "disclosure" },
  );
  links.push(
    { source: "scope:1", target: "kpi:ghg_s1", value: 18_120, measure: "tCO2e" },
    { source: "scope:2", target: "kpi:ghg_s2", value: 18_250, measure: "tCO2e" },
    { source: "scope:3", target: "kpi:ghg_s3", value: 4_910, measure: "tCO2e" },
    { source: "kpi:ghg_s1", target: "disc:GRI:305-1", value: 1, measure: "count", fit: "exact" },
    { source: "kpi:ghg_s1", target: "disc:BRSR:P6-E7", value: 1, measure: "count", fit: "exact" },
    { source: "kpi:ghg_s1", target: "disc:ESRS:E1-6", value: 1, measure: "count", fit: "exact" },
    { source: "kpi:ghg_s2", target: "disc:ESRS:E1-6", value: 1, measure: "count", fit: "partial" },
    { source: "kpi:ghg_s3", target: "disc:ESRS:E1-6", value: 1, measure: "count", fit: "derived" },
  );
  return { nodes, links };
};

export const materialityData = (scored: boolean): Materiality => ({
  scored,
  points: [
    { esrs_topic: "E1", label: "Climate", impact: scored ? 9 : null, financial: scored ? 8.5 : null, weight: 6, status: "at_risk", kpis: 6, on_track: 3, off_track: 1, link: "/kpi/esg?topic=climate" },
    { esrs_topic: "E3", label: "Water", impact: scored ? 6.5 : null, financial: scored ? 4 : null, weight: 3, status: "on_track", kpis: 3, on_track: 2, off_track: 0, link: "/kpi/esg?topic=water" },
    { esrs_topic: "S1", label: "Own workforce", impact: scored ? 7.5 : null, financial: scored ? 6 : null, weight: 9, status: "off_track", kpis: 9, on_track: 4, off_track: 3, link: "/kpi/esg?pillar=social" },
    { esrs_topic: "G1", label: "Business conduct", impact: scored ? 5 : null, financial: scored ? 7 : null, weight: 5, status: "no_data", kpis: 5, on_track: 0, off_track: 0, link: "/kpi/esg?pillar=governance" },
  ],
});

/** 69 months, Jan 2021 to Sep 2026, gently falling. */
export const stripesData: Stripes = (() => {
  const months: string[] = [];
  const values: (number | null)[] = [];
  for (let i = 0; i < 69; i += 1) {
    const y = 2021 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    values.push(Math.round((4_300 - i * 15 + (m === 5 || m === 6 ? 220 : 0)) * 10) / 10);
  }
  const nums = values.filter((v): v is number => v !== null);
  return { months, values, unit: "tCO2e", min: Math.min(...nums), max: Math.max(...nums) };
})();

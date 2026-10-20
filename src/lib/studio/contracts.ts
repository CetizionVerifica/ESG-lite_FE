/**
 * Design Studio contracts (DS-0): the frontend copy of ESG-lite
 * `src/studio/contracts/` (docs/design-studio/01-contracts.md, on top of the RS
 * base rs-base/01-contracts.md). Enums, the ReportDoc v2 types, bindings and
 * report inputs, error codes, check ids, AI actions and the HTTP shapes of §4.
 *
 * Change the backend contracts first (a DS-0 follow-up), then this file and
 * `contracts.snapshot.json` (a copy of ESG-lite `ci/studio-contracts.json`):
 * `contracts.test.ts` fails when the two disagree, and
 * `node scripts/check-studio-contracts.mjs ../ESG-lite` diffs the copy with
 * the backend's.
 *
 * The zod schema lives only in the backend. Where 01-contracts names an
 * endpoint but not its exact response, the shape here is marked "mock shape":
 * the owning module confirms or changes it in a DS-0 follow-up, and
 * `src/test/msw/studio.ts` answers with it until then.
 */

// ---------------------------------------------------------------------------
// §1 Enums
// ---------------------------------------------------------------------------

/** `ghg` needs only the studio switch; `sustainability` also needs KPI tracking (D4). */
export const REPORT_KINDS = ["ghg", "sustainability"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const PAGE_FORMATS = ["a4", "a4_landscape", "letter", "a5", "slide_16_9", "square", "social_191"] as const;
export type PageFormat = (typeof PAGE_FORMATS)[number];

/** Page size and bleed in mm (DS-1 §1). The renderer's `formats.ts` is the source; this is for layout maths. */
export const PAGE_FORMAT_SIZES: Record<PageFormat, { wMm: number; hMm: number; bleedMm: number }> = {
  a4: { wMm: 210, hMm: 297, bleedMm: 3 },
  a4_landscape: { wMm: 297, hMm: 210, bleedMm: 3 },
  letter: { wMm: 215.9, hMm: 279.4, bleedMm: 3 },
  a5: { wMm: 148, hMm: 210, bleedMm: 3 },
  slide_16_9: { wMm: 338.7, hMm: 190.5, bleedMm: 0 },
  square: { wMm: 285.75, hMm: 285.75, bleedMm: 0 },
  social_191: { wMm: 317.5, hMm: 166.1, bleedMm: 0 },
};

export const DOC_PURPOSES = ["report", "summary", "deck", "social"] as const;
export type DocPurpose = (typeof DOC_PURPOSES)[number];

export const REPORT_STATUSES = ["draft", "in_review", "approved", "final"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const VERSION_KINDS = ["snapshot", "review", "final", "autosave"] as const;
export type VersionKind = (typeof VERSION_KINDS)[number];

export const PAGE_KINDS = ["freeform", "flow"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export const FLOW_TYPES = [
  "toc",
  "narrative",
  "data_tables",
  "gri_index",
  "brsr_index",
  "esrs_index",
  "methodology",
  "glossary",
  "ghgp_index",
  "iso_index",
  "ghg_factor_table",
  "scope3_categories",
] as const;
export type FlowType = (typeof FLOW_TYPES)[number];

export const LAYOUT_KINDS = [
  "cover",
  "contents",
  "leadership",
  "about",
  "highlights",
  "chapter_opener",
  "data_page",
  "targets",
  "materiality",
  "people",
  "quote",
  "back_cover",
  "blank",
] as const;
export type LayoutKind = (typeof LAYOUT_KINDS)[number];

export const ELEMENT_TYPES = [
  "text",
  "kpi_tile",
  "chart",
  "table",
  "image",
  "shape",
  "icon",
  "sdg",
  "divider",
  "page_number",
  "placeholder",
  "frame",
  "grid",
  "line",
  "big_number",
  "progress",
  "callout",
  "qr",
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const CHART_KINDS = [
  "stacked_bar",
  "bar",
  "line",
  "donut",
  "share_bar",
  "waterfall",
  "sankey",
  "target_bars",
  "dot_grid",
  "materiality_matrix",
  "sparkline",
  "scope_split",
  "category_bars",
  "gas_split",
  "site_bars",
  "monthly_stack",
  "base_year_waterfall",
  "intensity_line",
  "treemap",
] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export const ELEMENT_SOURCES = ["layout", "auto", "ai", "user"] as const;
export type ElementSource = (typeof ELEMENT_SOURCES)[number];

export const TEXT_STYLE_IDS = ["kicker", "title", "heading", "subheading", "body", "caption", "big_number", "quote", "footnote"] as const;
export type TextStyleId = (typeof TEXT_STYLE_IDS)[number];

export const MEASURES = ["value", "change_abs", "change_pct", "share", "progress", "target", "baseline"] as const;
export type Measure = (typeof MEASURES)[number];

export const YEAR_REF_WORDS = ["current", "prior", "base"] as const;
export type YearRef = (typeof YEAR_REF_WORDS)[number] | number;

export const LOOKS = ["classic", "light", "night"] as const;
export type Look = (typeof LOOKS)[number];

export const FONT_IDS = [
  "source-serif-4",
  "source-sans-3",
  "dm-serif-display",
  "ibm-plex-sans",
  "ibm-plex-serif",
  "archivo",
  "fraunces",
  "noto-sans",
] as const;
export type FontId = (typeof FONT_IDS)[number];

export const NUMBER_FORMATS = ["auto", "int", "1dp", "2dp", "pct0", "pct1", "compact", "indian"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export const YEAR_TYPES = ["CY", "FY"] as const;
export type YearType = (typeof YEAR_TYPES)[number];

export const SUSTAINABILITY_FRAMEWORKS = ["GRI", "BRSR", "ESRS"] as const;
export const GHG_FRAMEWORKS = ["GHGP", "ISO14064", "BRSR_P6", "ESRS_E1"] as const;
export const FRAMEWORK_CODES = [...SUSTAINABILITY_FRAMEWORKS, ...GHG_FRAMEWORKS] as const;
export type FrameworkCode = (typeof FRAMEWORK_CODES)[number];
export const FRAMEWORKS_BY_KIND: Record<ReportKind, readonly FrameworkCode[]> = { ghg: GHG_FRAMEWORKS, sustainability: SUSTAINABILITY_FRAMEWORKS };

export const DOWNLOAD_KINDS = ["pdf_screen", "pdf_print", "png_pages"] as const;
export type DownloadKind = (typeof DOWNLOAD_KINDS)[number];

export const JOB_KINDS = ["proof", "final", "thumbnail", "png", "print"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const APPROVAL_STATES = ["none", "requested", "approved", "changes_requested"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const CHECK_SEVERITIES = ["error", "warning", "info"] as const;
export type CheckSeverity = (typeof CHECK_SEVERITIES)[number];

export const RENDER_MODES = ["sheet", "paged", "present", "print"] as const;
export type RenderMode = (typeof RENDER_MODES)[number];

/** R = Admin, Manager, Superadmin (create and edit); M = Manager, Superadmin (finals, approvals, share links). */
export const STUDIO_EDITOR_ROLES = ["Admin", "Manager", "Superadmin"] as const;
export const STUDIO_MANAGER_ROLES = ["Manager", "Superadmin"] as const;
export const canEditStudio = (role: string | null | undefined) => !!role && (STUDIO_EDITOR_ROLES as readonly string[]).includes(role);
export const canFinaliseStudio = (role: string | null | undefined) => !!role && (STUDIO_MANAGER_ROLES as readonly string[]).includes(role);

/** `palette`: [primary, accent, ink, surface, muted]. */
export interface StylePreset {
  id: string;
  name: string;
  palette: [string, string, string, string, string];
  fonts: { heading: FontId; body: FontId };
}

// ---------------------------------------------------------------------------
// §1–§2.1 Sources, bindings, tokens, report inputs
// ---------------------------------------------------------------------------

export const DATA_SOURCES = ["kpi", "ghg", "input", "custom"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const GHG_METRICS = [
  "total",
  "scope1",
  "scope2_location",
  "scope2_market",
  "scope3",
  "scope3_category",
  "biogenic_co2",
  "gas_co2",
  "gas_ch4",
  "gas_n2o",
  "gas_other",
  "intensity_revenue",
  "intensity_output",
  "intensity_employee",
  "base_year_total",
  "dq_score",
  "primary_data_pct",
  "sites_covered",
  "months_covered",
] as const;
export type GhgMetric = (typeof GHG_METRICS)[number];

export const GHG_BREAKDOWNS = ["scope", "scope3_category", "site", "month", "quarter", "gas", "fuel", "source_category"] as const;
export type GhgBreakdown = (typeof GHG_BREAKDOWNS)[number];

export type Sites = "all" | number[];
export type BindingYears = { last: number } | number[];

/** RS `Binding`, now the `kpi` variant. */
export interface KpiBinding {
  source: "kpi";
  kpis: string[];
  years: BindingYears;
  sites: Sites;
  unit?: string;
  breakdown?: string;
  compare?: "prior" | "base" | "target";
}
export interface GhgBinding {
  source: "ghg";
  metric: GhgMetric;
  years: BindingYears;
  sites: Sites;
  breakdown?: GhgBreakdown;
  /** 1–15 */
  scope3Category?: number;
  top?: number;
  compare?: "prior" | "base";
}

export const REPORT_INPUT_KEYS = [
  "consolidation_approach",
  "responsible_person",
  "reporting_period",
  "base_year",
  "recalculation_policy",
  "significance_threshold_pct",
  "gwp_set",
  "exclusions",
  "scope2_instruments",
  "uncertainty_statement",
  "verification",
  "conformance",
  "revenue",
  "revenue_ppp_rate",
  "output_units",
  "employees",
  "leadership_message",
  "about_company",
] as const;
export type ReportInputKey = (typeof REPORT_INPUT_KEYS)[number];

export const REPORT_INPUT_KINDS: Record<ReportInputKey, readonly ReportKind[]> = {
  consolidation_approach: ["ghg"],
  responsible_person: ["ghg"],
  reporting_period: ["ghg", "sustainability"],
  base_year: ["ghg"],
  recalculation_policy: ["ghg"],
  significance_threshold_pct: ["ghg"],
  gwp_set: ["ghg"],
  exclusions: ["ghg"],
  scope2_instruments: ["ghg"],
  uncertainty_statement: ["ghg"],
  verification: ["ghg", "sustainability"],
  conformance: ["ghg"],
  revenue: ["ghg"],
  revenue_ppp_rate: ["ghg"],
  output_units: ["ghg"],
  employees: ["ghg"],
  leadership_message: ["sustainability"],
  about_company: ["sustainability"],
};
export const inputKeysFor = (kind: ReportKind): ReportInputKey[] => REPORT_INPUT_KEYS.filter((k) => REPORT_INPUT_KINDS[k].includes(kind));

export const INPUT_SOURCES = ["company", "typed", "kpi"] as const;
export type InputSource = (typeof INPUT_SOURCES)[number];
export const VERIFICATION_STATUSES = ["none", "limited", "reasonable"] as const;
export const CONFORMANCE_CODES = ["GHGP", "ISO14064"] as const;
export const GWP_SETS = ["AR4", "AR5", "AR6", "MIXED"] as const;

export interface ReportInputValues {
  consolidation_approach: string;
  responsible_person: string;
  reporting_period: string;
  base_year: number;
  recalculation_policy: string;
  significance_threshold_pct: number;
  gwp_set: (typeof GWP_SETS)[number];
  exclusions: { what: string; reason: string }[];
  scope2_instruments: string;
  uncertainty_statement: string;
  verification: { status: (typeof VERIFICATION_STATUSES)[number]; provider?: string; statementAssetId?: string };
  conformance: (typeof CONFORMANCE_CODES)[number][];
  revenue: number;
  revenue_ppp_rate: number;
  output_units: number;
  employees: number;
  leadership_message: string;
  about_company: string;
}
export interface ReportInput<K extends ReportInputKey = ReportInputKey> {
  value: ReportInputValues[K];
  source: InputSource;
  updatedBy: number | null;
  updatedAt: string;
}
export type ReportInputs = { [K in ReportInputKey]?: ReportInput<K> };

export interface InputBinding {
  source: "input";
  key: ReportInputKey;
}
/** Typed table data (≤ 200 × 20). Never a reported figure: shows "Unlinked data". */
export interface CustomData {
  source: "custom";
  columns: string[];
  rows: (string | number)[][];
}
export type Binding = KpiBinding | GhgBinding | InputBinding | CustomData;
export type ValueBinding = KpiBinding | GhgBinding | InputBinding;

/** A text chip: one value. `year` is kept from an RS KpiToken by the v1 upgrade. */
export interface DataToken {
  type: "data";
  attrs: { binding: GhgBinding | KpiBinding; measure: Measure; format?: NumberFormat; year?: YearRef };
}

// ---------------------------------------------------------------------------
// §2 ReportDoc v2
// ---------------------------------------------------------------------------

export const TEXT_NODE_TYPES = ["paragraph", "heading", "bulletList", "orderedList", "listItem", "hardBreak", "text"] as const;
export const TEXT_MARK_TYPES = ["bold", "italic", "link", "highlight", "footnote"] as const; // footnote: DS-7
/** DS-7: a footnote's text (factor sources, methodology notes). */
export const MAX_FOOTNOTE_CHARS = 500;
export type TextMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "highlight"; attrs?: { color?: string } }
  | { type: "link"; attrs: { href: string } }
  | { type: "footnote"; attrs: { note: string } };
export interface TextNode {
  type: (typeof TEXT_NODE_TYPES)[number];
  attrs?: Record<string, unknown>;
  content?: (TextNode | DataToken)[];
  text?: string;
  marks?: TextMark[];
}
export interface TextDoc {
  type: "doc";
  content: TextNode[];
}

export interface ThemeOverrides {
  look?: Look;
  colors?: Partial<Record<"primary" | "accent" | "ink" | "muted" | "surface" | "coverFrom" | "coverTo", string>>;
  fonts?: { heading?: FontId; body?: FontId };
}

export const ASSET_KINDS = ["image", "logo", "ai_image"] as const;
export interface AssetRef {
  id: string;
  kind: (typeof ASSET_KINDS)[number];
  w: number;
  h: number;
  alt: string;
}

/** Millimetres on the doc's format, origin top-left; rotation in degrees. */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FRAME_MASKS = ["rect", "rounded", "circle", "arch", "blob"] as const;
export type FrameMask = (typeof FRAME_MASKS)[number];

export interface ElementPropsByType {
  text: { doc: TextDoc; style: TextStyleId; align: "left" | "center" | "right" | "justify"; color?: string; valign?: "top" | "middle" | "bottom" };
  kpi_tile: { binding: ValueBinding; label?: string; showDelta: boolean; showSparkline: boolean; variant: "plain" | "card" | "band" };
  chart: {
    binding: Binding;
    kind: ChartKind;
    title?: string;
    subtitle?: string;
    caption?: string;
    options: Partial<Record<"greyPrior" | "showValues" | "horizontal" | "stacked" | "showTarget" | "showLegend" | "basisNote", boolean>> & {
      // DS-8: scope colours (default) or the brand series; scope_split as a 100 % bar or a donut.
      colors?: "scope" | "brand";
      variant?: "bar" | "donut";
    };
  };
  table: {
    binding?: Binding;
    columns?: string[];
    rows?: (string | number | null)[][];
    style: "lined" | "zebra" | "minimal";
    totalRow?: boolean;
    /** DS-8: column widths in % of the frame. */
    colWidths?: number[];
    /** DS-8: merged body cells (static tables only). */
    merges?: { r: number; c: number; rs: number; cs: number }[];
  };
  image: { assetId: string; fit: "cover" | "contain"; alt: string; crop?: Crop; radius?: number; bleed?: boolean };
  shape: { shape: "rect" | "ellipse" | "line"; fill?: string; stroke?: string; strokeWidth?: number; radius?: number; opacity?: number; bleed?: boolean };
  icon: { name: string; color?: string };
  sdg: { goal: number; variant: "full" | "compact" };
  divider: { color?: string; strokeWidth?: number; style?: "solid" | "dashed" | "dotted" };
  page_number: { format?: "n" | "n_of_m"; align?: "left" | "center" | "right"; color?: string };
  placeholder: { accepts: ("text" | "image" | "chart" | "table" | "kpi_tile" | "frame" | "big_number")[]; hint?: string };
  frame: { mask: FrameMask; assetId?: string; fit: "cover" | "contain"; alt: string; crop?: Crop; bleed?: boolean };
  grid: { columns: number; gap: number; mask?: FrameMask; cells: { assetId?: string; alt: string; crop?: Crop }[] };
  line: { x1: number; y1: number; x2: number; y2: number; stroke?: string; strokeWidth: number; dash: "solid" | "dashed" | "dotted"; startArrow?: boolean; endArrow?: boolean };
  big_number: { binding: ValueBinding; measure?: Measure; format?: NumberFormat; label?: string; showDelta: boolean };
  progress: { binding: ValueBinding; variant: "ring" | "bar"; label?: string; color?: string };
  callout: { doc: TextDoc; icon?: string; tone?: "primary" | "accent" | "muted" | "good" | "warn"; color?: string };
  qr: { url: string; color?: string };
}

interface ElementBase {
  /** '<pageId>.<slot>' for layout elements, a nanoid for user ones. */
  id: string;
  frame: Frame;
  z: number;
  locked?: boolean;
  templateLocked?: boolean;
  groupId?: string;
  hidden?: boolean;
  /** Transparency (DS-6 toolbar); 1 when absent. */
  opacity?: number;
  source: ElementSource;
  reviewed?: boolean;
  basedOnHash?: string;
}
export type ElementOf<T extends ElementType> = ElementBase & { type: T; props: ElementPropsByType[T] };
export type Element = { [T in ElementType]: ElementOf<T> }[ElementType];

export interface FreeformPage {
  id: string;
  kind: "freeform";
  name: string;
  layoutId?: string;
  background: { color?: string; assetId?: string; fit?: "cover" | "contain" };
  elements: Element[];
  hidden?: boolean;
  lockedByTemplate?: boolean;
  bookmark?: string;
  /** Speaker notes (Present, DS-11). */
  notes?: string;
  /** Ruler guides (DS-6), never printed. */
  guides?: { axis: "x" | "y"; mm: number }[];
}
export interface FlowOptions {
  columns?: 1 | 2;
  kpis?: string[];
  years?: { last: number };
  groupBy?: "pillar" | "topic";
  showEvidence?: boolean;
  startOnRight?: boolean;
  categories?: number[];
  showDq?: boolean;
  showMethod?: boolean;
}
export interface FlowSection {
  id: string;
  kind: "flow";
  name: string;
  flowType: FlowType;
  options: FlowOptions;
  content?: TextDoc;
  hidden?: boolean;
  bookmark?: string;
}
export type Page = FreeformPage | FlowSection;

export interface ReportDoc {
  schemaVersion: 2;
  kind: ReportKind;
  purpose: DocPurpose;
  format: PageFormat;
  meta: {
    title: string;
    subtitle?: string;
    year: number;
    yearType: YearType;
    sites: Sites;
    frameworks: FrameworkCode[];
    compareYear?: number;
    language: "en";
  };
  design: { templateId: string; templateVersion: number; styleId?: string; theme: ThemeOverrides };
  pages: Page[];
  assets: AssetRef[];
  /** Set on a resized copy (DS-10). */
  source?: { docId: number; rev: number; dataHash: string };
}

export const MAX_DOC_BYTES = 2 * 1024 * 1024;

// ---------------------------------------------------------------------------
// §4 API shapes (mounted at /studio)
// ---------------------------------------------------------------------------

/** GET /studio/status: answers while the switch is off. */
export interface StudioStatus {
  enabled: boolean;
  kinds: Record<ReportKind, boolean>;
}

// DS-5 · readiness (confirmed; ESG-lite src/studio/contracts/docs.ts)
export const GHG_GAP_KINDS = ["pending_entries", "rejected_entries", "site_no_data", "months_missing", "scope3_unaddressed", "no_data"] as const;
export type GhgGapKind = (typeof GHG_GAP_KINDS)[number];
export type ReadinessState = "ready" | "almost" | "not_ready";
/** One thing to fix before a final, with the app route that fixes it. */
export interface ReadinessGap {
  kind: GhgGapKind | "kpi_missing" | "kpi_pending" | "year_not_locked" | "kpi_setup";
  severity: CheckSeverity;
  message: string;
  link: string | null;
  linkLabel: string | null;
  siteId?: number;
  months?: string[];
  categories?: number[];
  count?: number;
}
/** GET /readiness?kind=ghg&year=&yearType=&sites=. */
export interface GhgReadiness {
  kind: "ghg";
  year: number;
  yearType: YearType;
  /** "FY 2025–26" / "2025". */
  periodLabel: string;
  approvedRows: number;
  pendingRows: number;
  rejectedRows: number;
  sitesCovered: number;
  sitesTotal: number;
  sitesMissing: { id: number; name: string }[];
  monthsCovered: number;
  monthsExpected: number;
  monthsMissing: { siteId: number; siteName: string; months: string[] }[];
  /** "n/15" */
  scope3Addressed: string;
  scope3: { reported: number[]; excluded: number[]; unaddressed: number[] };
  state: ReadinessState;
  gaps: ReadinessGap[];
}
/** GET /readiness?kind=sustainability: the RS readiness. */
export interface SustainabilityReadiness {
  kind: "sustainability";
  year: number;
  yearType: YearType;
  periodLabel: string;
  setupDone: boolean;
  locked: boolean;
  lockedAt: string | null;
  coverage: { framework: string; pct: number }[];
  missing: { kpi: string; name: string; sites: number[]; periods: string[] }[];
  pendingCount: number;
  state: ReadinessState;
  gaps: ReadinessGap[];
}
export type Readiness = GhgReadiness | SustainabilityReadiness;
// end DS-5 readiness

// DS-3 · brand kit (confirmed; ESG-lite src/studio/contracts/brandkit.ts)
export const BRAND_VOICE_MAX = 3000;
export const PALETTE_MAX_COLORS = 10;
export const PALETTES_MAX = 20;
export const PALETTE_NAME_MAX = 60;
/** WCAG thresholds of the theme engine (src/theme/buildTheme.ts AA_TEXT, AA_UI). */
export const AA_TEXT_RATIO = 4.5;
export const AA_UI_RATIO = 3;

/** One colour pair of a palette: WCAG ratio, ≥ 4.5 text, ≥ 3 graphic. */
export interface PaletteContrast {
  a: string;
  b: string;
  ratio: number;
  text: boolean;
  graphic: boolean;
}
export interface BrandPalette {
  id: number;
  name: string;
  colors: string[];
  sort: number;
  /** Every pair of the palette's colours. */
  contrast: PaletteContrast[];
}
/** GET /brand-kit, and the answer to PUT. Logos and brand colours come from `brand` (Superadmin edits them in /brands). */
export interface BrandKit {
  name: string;
  logos: { primary: string | null; onDark: string | null };
  colors: { primary: string; accent: string; coverFrom: string; coverTo: string };
  defaultLook: Look;
  fonts: { heading: FontId | null; body: FontId | null };
  voice: string;
  palettes: BrandPalette[];
  /** Manager or Superadmin. */
  canEdit: boolean;
  /** company.brand_controls (DS-13): pickers show brand palettes and the brand font pair only. */
  brandControls: boolean;
  updatedAt: string | null;
}
/** PUT /brand-kit (Manager): each part optional; `palettes` replaces the list (order = sort; `id` keeps a palette). */
export interface BrandKitUpdate {
  fonts?: { heading: FontId | null; body: FontId | null };
  voice?: string;
  palettes?: { id?: number; name: string; colors: string[] }[];
}
// end DS-3

/**
 * GET /templates (DS-4, confirmed: ESG-lite src/studio/contracts/library.ts).
 * The fields marked DS-4 are always sent by the backend; they are optional
 * here only so older mocks still type-check.
 */
export interface ReportTemplate {
  id: number;
  companyId: number | null;
  kind: ReportKind;
  purpose: DocPurpose;
  format: PageFormat;
  name: string;
  tags: string[];
  version: number;
  thumbnailUrl: string | null;
  pageCount: number;
  /** DS-4: `<family>-<look>` (a one-look family: `<family>`), = doc.design.templateId. */
  slug?: string;
  /** DS-4: the template the looks share; its layouts carry the same family. */
  family?: string;
  /** DS-4: Classic, Light or Night (D9); null for company templates. */
  look?: Look | null;
  /** DS-4: one line for the gallery card. */
  description?: string;
}
export interface ReportTemplateDetail extends ReportTemplate {
  /** A full ReportDoc with placeholders ({{company}}, {{period}}, {{year}}, {{title}}); bindings relative to the doc's year. */
  doc: ReportDoc;
}
/** GET /layouts (DS-4, confirmed). */
export interface ReportLayout {
  id: number;
  companyId: number | null;
  kind: ReportKind;
  format: PageFormat;
  pageKind: LayoutKind;
  name: string;
  thumbnailUrl: string | null;
  /** A FreeformPage whose id is the layout's role and whose element ids are `<role>.<slot>`. */
  page: FreeformPage;
  /** DS-4: `<family>/<role>`, the value FreeformPage.layoutId holds. */
  slug?: string;
  family?: string;
  /** DS-4: what the page is for (`cover`, `scope1`, `exec_summary`…); applyTemplate maps pages by it. */
  role?: string;
  sort?: number;
}
export const ELEMENT_GROUPS = ["shapes", "lines", "frames", "grids", "icons", "sdg", "esg", "data"] as const;
export type ElementGroup = (typeof ELEMENT_GROUPS)[number];
/** DS-4: an editable group (ESG graphics); children's frames are relative to the w × h box and share a groupId once inserted. */
export interface ElementGroupPayload {
  type: "group";
  w: number;
  h: number;
  elements: Element[];
}
/** GET /elements (DS-4, confirmed). `payload` sits at x = y = 0; ids are replaced on insert. */
export interface ElementTemplate {
  id: number;
  companyId: number | null;
  group: ElementGroup;
  name: string;
  tags: string[];
  payload: Element | ElementGroupPayload;
  license: string;
}
/** POST/GET /assets (DS-4, confirmed). */
export interface StudioAsset extends AssetRef {
  folder: string | null;
  /** The R2 public URL (or the local-uploads URL in development). */
  url: string;
  bytes: number;
  mime: string;
  /** DS-4 */
  sha256?: string;
  /** DS-4 */
  createdAt?: string;
}
/** DS-4: uploads are JPG, PNG, WebP or SVG, up to 10 MB. */
export const ASSET_MAX_BYTES = 10 * 1024 * 1024;
export const ASSET_MIMES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"] as const;

/** POST /resolve. */
export interface ResolveRequest {
  kind: ReportKind;
  year: number;
  yearType: YearType;
  sites: Sites;
  bindings: Binding[];
  tokens: DataToken[];
}
/**
 * DS-2: why a binding has no value (`unavailable.reason`), as ESG-lite
 * src/studio/sources/types.ts sends it.
 */
export const UNAVAILABLE_REASONS = ["NOT_RECORDED", "NOT_TRACKED", "NO_DATA", "NO_BASE_YEAR", "NO_INPUT", "NO_TARGET", "KPI_TRACKING_OFF", "EXCLUDED", "DIVIDE_BY_ZERO"] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

/** One resolved binding or token (DS-2, src/studio/sources/types.ts). `display` is already rounded; the FE shows it as is. */
export interface ResolvedBinding {
  source: DataSource;
  display: string;
  value: number | null;
  unit: string | null;
  /** Without a breakdown: one series over the years; with one: a series per year keyed by the breakdown. */
  series?: { label: string; values: { key: string; value: number | null }[] }[];
  approvedAt?: string | null;
  evidenceCount?: number;
  /** DS-7 (GHG): approved emission entries behind the figure (chip hover card). */
  approvedEntries?: number;
  complete?: boolean;
  compare?: { against: "prior" | "base" | "target"; year: number | null; value: number | null; change_abs: number | null; change_pct: number | null; reason?: string };
  target?: { baseline_year: number; baseline_value: number; target_year: number; target_value: number; progress_pct: number | null; status: string };
  total?: number | null;
  /** DS-8: month or quarter breakdowns, one series per scope of the current year (monthly_stack). */
  stacks?: { label: string; values: { key: string; value: number | null }[] }[];
  unavailable?: { reason: UnavailableReason; detail?: string };
}
export interface ResolveResponse {
  values: ResolvedBinding[];
  tokens: ResolvedBinding[];
  dataHash: string;
  unavailable: { bindingIdx: number; reason: UnavailableReason; token?: boolean }[];
}

/** A prefilled input: what the company's data already says (DS-2 inputs.ts). `note` is a unit or the GWP sets behind MIXED. */
export type InputPrefill = Partial<Record<ReportInputKey, { value: unknown; source: InputSource; note?: string }>>;

/** GET /docs/:id/inputs and PATCH /docs/:id/inputs (`{rev, inputs: {key: {value, source?} | null}}`). */
export interface DocInputsResponse {
  rev: number;
  inputs: ReportInputs;
  prefill: InputPrefill;
}
/** PATCH /docs/:id/inputs body: a value per key (source defaults to typed); null removes the key. */
export type InputsPatch = Partial<Record<ReportInputKey, { value: unknown; source?: InputSource } | null>>;

/** DS-2 addition: GET /inputs/prefill?kind=&year=&yearType=&sites= (the new-design flow, before a doc exists). */
export interface InputsPrefillResponse {
  keys: ReportInputKey[];
  prefill: InputPrefill;
}

/** DS-2 addition: GET /data?kind=&year=&yearType=&sites=&q=&topic=&framework= (the Data drawer list). */
export interface DataItem {
  id: string;
  label: string;
  binding: GhgBinding | KpiBinding;
  resolved: Pick<ResolvedBinding, "display" | "value" | "unit" | "approvedAt" | "unavailable" | "series" | "complete">;
}
export interface DataGroup {
  id: string;
  label: string;
  items: DataItem[];
}
export interface DataCatalogResponse {
  kind: ReportKind;
  year: number;
  yearType: YearType;
  siteIds: number[];
  groups: DataGroup[];
}

/** DS-2 addition: GET/PUT /materiality (materiality matrix scores, sustainability kind). */
export interface MaterialTopic {
  esrs_topic: string;
  name: string;
  material: boolean;
  impact_score: number | null;
  financial_score: number | null;
}
export interface MaterialityResponse {
  topics: MaterialTopic[];
  points: { topic: string; label: string; impact: number; financial: number }[] | null;
}

// DS-5 · designs (confirmed; ESG-lite src/studio/contracts/docs.ts)
export const BUILD_STEP_IDS = ["template", "data", "layout", "inputs", "ai", "save"] as const;
export type BuildStepId = (typeof BUILD_STEP_IDS)[number];
export type BuildState = "running" | "done" | "failed";
export interface BuildStep {
  id: BuildStepId;
  label: string;
  state: "pending" | "running" | "done" | "skipped" | "failed";
  note?: string;
}
/** `report_doc.build`: the auto-build progress, polled with GET /docs/:id?build=1. */
export interface BuildProgress {
  state: BuildState;
  steps: BuildStep[];
  dropped: { pageId: string; name: string; reason: string }[];
  pageCount: number | null;
  startedAt: string;
  finishedAt: string | null;
  error?: { code: string; message: string };
}
/** GET /docs list item. */
export interface StudioDocSummary {
  id: number;
  kind: ReportKind;
  purpose: DocPurpose;
  format: PageFormat;
  title: string;
  year: number;
  yearType: YearType;
  status: ReportStatus;
  rev: number;
  pageCount: number;
  templateId: number | null;
  sourceDocId: number | null;
  /** n of the newest final version ("Final v2"). */
  finalVersion: number | null;
  buildState: BuildState | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  /** null until DS-11 renders thumbnails. */
  thumbnailUrl: string | null;
}
/** `templateId: "blank"` makes a one-page blank design in `format`. */
export const BLANK_TEMPLATE = "blank" as const;
/** POST /docs body (`?wait=0` answers 202 `{id, build}` and builds in the background). `inputs` is an InputsPatch. */
export interface CreateDocBody {
  kind: ReportKind;
  templateId: number | typeof BLANK_TEMPLATE;
  year: number;
  yearType: YearType;
  sites: Sites;
  frameworks: FrameworkCode[];
  compareYear?: number;
  title?: string;
  /** Blank designs only. */
  format?: PageFormat;
  inputs: InputsPatch;
  ai: boolean;
}
/** GET/PATCH /docs/:id, POST /docs (201), POST /docs/:id/rebuild. */
export interface StudioDocResponse {
  id: number;
  doc: ReportDoc;
  rev: number;
  status: ReportStatus;
  title: string;
  dataHash: string | null;
  updatedAt: string;
  build: BuildProgress | null;
}
/** POST /docs?wait=0 (202) and GET /docs/:id?build=1. */
export interface StudioDocBuild {
  id: number;
  rev: number;
  status: ReportStatus;
  title: string;
  build: BuildProgress | null;
}
/** PATCH /docs/:id body: the whole doc (autosave), a rename, or both. */
export interface PatchDocBody {
  rev: number;
  doc?: ReportDoc;
  title?: string;
}
// end DS-5 designs

// DS-11 · preview, render jobs, versions and view links (ESG-lite src/studio/contracts/jobs.ts)
export const PREVIEW_MODES = ["sheet", "paged", "present", "print"] as const;
export type PreviewMode = (typeof PREVIEW_MODES)[number];
/** PNG resolution: 144 dpi (2×, screen) or 300 dpi (print). */
export const PNG_DPIS = [144, 300] as const;
export type PngDpi = (typeof PNG_DPIS)[number];
export interface JobOptions {
  /** print: crop marks around the trim box (bleed is always 3 mm on print formats). */
  cropMarks?: boolean;
  bleed?: boolean;
  /** png: a 1-based inclusive page range. */
  pages?: [number, number];
  dpi?: PngDpi;
  /** thumbnail: the page to draw. */
  pageId?: string;
}
/** POST /docs/:id/jobs body. A final needs `note` when a final already exists. */
export interface CreateJobBody {
  kind: JobKind;
  rev: number;
  options?: JobOptions;
  acknowledgedWarnings?: string[];
  note?: string;
}
/** POST /docs/:id/jobs and GET /jobs/:id. The storage key is never part of it. */
export interface ReportJob {
  id: number;
  docId: number;
  versionId: number | null;
  /** n of the final version the job made. */
  versionN: number | null;
  kind: JobKind;
  status: JobStatus;
  errorCode: DsErrorCode | null;
  /** timeout | font | chromium | measure | storage | data */
  errorReason: string | null;
  requestedBy: number | null;
  rev: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** API path of the file once done (GET with the session). */
  downloadUrl: string | null;
  fileName: string | null;
  bytes: number | null;
  pageCount: number | null;
  /** Proofs, prints and PNGs are kept 7 days; finals never expire (null). */
  expiresAt: string | null;
  options?: JobOptions;
}
export interface ReportVersion {
  id: number;
  n: number;
  kind: VersionKind;
  rev: number | null;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  pageCount: number | null;
  /** API path of the stored PDF (finals). */
  pdfUrl: string | null;
  pdfSha256: string | null;
  dataHash: string | null;
  rendererHash: string | null;
  /** A final with a newer final after it. */
  superseded: boolean;
}
export const SHARE_DAYS_DEFAULT = 14;
export const SHARE_DAYS_MAX = 90;
/** POST /docs/:id/shares body: a final version or a finished proof job. */
export interface CreateShareBody {
  versionId?: number;
  jobId?: number;
  expiresInDays: number;
}
/** POST /docs/:id/shares returns `url` once; GET lists without it. */
export interface ReportShare {
  id: number;
  docId: number;
  versionId: number | null;
  versionN: number | null;
  jobId: number | null;
  /** "Final v2" or "Proof · 21 Oct 2026". */
  label: string;
  expiresAt: string;
  revokedAt: string | null;
  views: number;
  lastViewedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  state: "active" | "expired" | "revoked";
  url?: string;
}
/** GET /s/:token/meta (public, no session). */
export interface PublicShareMeta {
  title: string;
  company: string;
  logoUrl: string | null;
  label: string;
  expiresAt: string;
  pageCount: number | null;
  /** API path of the stored PDF. */
  fileUrl: string;
}
// end DS-11

// ---------------------------------------------------------------------------
// DS-10 · Resize and convert (ESG-lite src/studio/contracts/resize.ts)
// ---------------------------------------------------------------------------

/** `POST /studio/docs/:id/resize`. `ai` asks for AI summaries (DS-9); off = text cut to fit. */
export interface ResizeBody {
  format: PageFormat;
  purpose: DocPurpose;
  pageIds?: string[];
  title?: string;
  ai?: boolean;
}

/** 201 answer: the new design and what the copy left out. */
export interface ResizeResponse {
  id: number;
  title: string;
  pageCount: number;
  dropped: number;
  truncated: number;
  summarised: number;
}

/** `GET /studio/docs/:id/source` (`source` null for a design that isn't a resized copy). */
export interface LinkedSource {
  docId: number;
  /** False when the source was deleted or can't be read any more. */
  exists: boolean;
  title: string | null;
  rev: number;
  dataHash: string;
  currentRev: number | null;
  currentDataHash: string | null;
  /** "Source data changed". */
  dataChanged: boolean;
}
export interface LinkedSourceResponse {
  source: LinkedSource | null;
}
// end DS-10

// ---------------------------------------------------------------------------
// §5 Error codes
// ---------------------------------------------------------------------------

export const DS_ERROR_STATUS = {
  DS_STUDIO_OFF: 403,
  DS_KIND_OFF: 403,
  DS_FORMAT_INVALID: 422,
  DS_SOURCE_UNAVAILABLE: 422,
  DS_SHARE_EXPIRED: 410,
  DS_APPROVAL_PENDING: 409,
  DS_RESIZE_UNSUPPORTED: 422,
  DS_ROLE: 403,
  DS_SITES_SCOPE: 403,
  DS_DOC_NOT_FOUND: 404,
  DS_VERSION_CONFLICT: 409,
  DS_FINAL_IMMUTABLE: 409,
  DS_DOC_INVALID: 422,
  DS_DOC_TOO_LARGE: 413,
  DS_BINDING_INVALID: 422,
  DS_LAYOUT_NOT_FOUND: 404,
  DS_ASSET_TYPE: 415,
  DS_ASSET_TOO_LARGE: 413,
  DS_YEAR_NOT_LOCKED: 409,
  DS_CHECKS_BLOCKING: 409,
  DS_JOB_RUNNING: 409,
  DS_JOB_FAILED: 500,
  DS_AI_UNAVAILABLE: 503,
  DS_AI_BUDGET_EXCEEDED: 429,
  DS_AI_OUTPUT_INVALID: 502,
  DS_VALIDATION: 400,
  DS_COMPANY_REQUIRED: 400,
} as const;
export type DsErrorCode = keyof typeof DS_ERROR_STATUS;
export const DS_ERROR_CODES = Object.keys(DS_ERROR_STATUS) as DsErrorCode[];
export interface DsErrorBody {
  code: DsErrorCode;
  message: string;
  details?: unknown;
}
export const isDsErrorCode = (v: unknown): v is DsErrorCode => typeof v === "string" && v in DS_ERROR_STATUS;

// ---------------------------------------------------------------------------
// §6 Checks
// ---------------------------------------------------------------------------

export const CHECK_IDS = [
  "YEAR_NOT_LOCKED",
  "VALUES_MISSING",
  "NUMBER_MISMATCH",
  "NUMBER_UNBOUND",
  "TEXT_OVERFLOW",
  "OUTSIDE_SAFE_AREA",
  "OVERLAPS_LOCKED",
  "FONT_TOO_SMALL",
  "LOW_CONTRAST",
  "EMPTY_PLACEHOLDER",
  "MISSING_ALT",
  "AI_UNREVIEWED",
  "LEADERSHIP_UNCONFIRMED",
  "DATA_CHANGED",
  "GHG_PENDING_ENTRIES",
  "GHG_SITES_MISSING",
  "GHG_MONTHS_MISSING",
  "CONSOLIDATION_MISSING",
  "PERIOD_MISSING",
  "BASE_YEAR_MISSING",
  "RECALC_POLICY_MISSING",
  "SCOPE2_MARKET_MISSING",
  "GAS_BREAKDOWN_MISSING",
  "BIOGENIC_IN_SCOPE",
  "BIOGENIC_NOT_SHOWN",
  "SCOPE3_CATEGORY_UNADDRESSED",
  "EXCLUSION_NO_REASON",
  "SCOPE3_DQ_MISSING",
  "EF_SOURCE_MISSING",
  "GWP_MIXED",
  "RESPONSIBLE_PERSON_MISSING",
  "UNCERTAINTY_MISSING",
  "VERIFICATION_STATEMENT_MISSING",
  "INTENSITY_MISSING",
  "TOTAL_MISMATCH",
  "YOY_UNEXPLAINED",
  "UNLINKED_DATA",
  "TEXT_TRUNCATED", // DS-10
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

const BOTH = ["ghg", "sustainability"] as const;
const GHG = ["ghg"] as const;
const SUS = ["sustainability"] as const;
/** Default severity and the kinds each check applies to (D8 escalates ISO checks). */
export const CHECK_RULES: Record<CheckId, { severity: CheckSeverity; kinds: readonly ReportKind[] }> = {
  YEAR_NOT_LOCKED: { severity: "error", kinds: SUS },
  VALUES_MISSING: { severity: "warning", kinds: BOTH },
  NUMBER_MISMATCH: { severity: "error", kinds: BOTH },
  NUMBER_UNBOUND: { severity: "info", kinds: BOTH },
  TEXT_OVERFLOW: { severity: "error", kinds: BOTH },
  OUTSIDE_SAFE_AREA: { severity: "error", kinds: BOTH },
  OVERLAPS_LOCKED: { severity: "warning", kinds: BOTH },
  FONT_TOO_SMALL: { severity: "error", kinds: BOTH },
  LOW_CONTRAST: { severity: "error", kinds: BOTH },
  EMPTY_PLACEHOLDER: { severity: "error", kinds: BOTH },
  MISSING_ALT: { severity: "warning", kinds: BOTH },
  AI_UNREVIEWED: { severity: "warning", kinds: BOTH },
  LEADERSHIP_UNCONFIRMED: { severity: "error", kinds: SUS },
  DATA_CHANGED: { severity: "warning", kinds: BOTH },
  GHG_PENDING_ENTRIES: { severity: "error", kinds: GHG },
  GHG_SITES_MISSING: { severity: "warning", kinds: GHG },
  GHG_MONTHS_MISSING: { severity: "warning", kinds: GHG },
  CONSOLIDATION_MISSING: { severity: "error", kinds: GHG },
  PERIOD_MISSING: { severity: "error", kinds: GHG },
  BASE_YEAR_MISSING: { severity: "warning", kinds: GHG },
  RECALC_POLICY_MISSING: { severity: "warning", kinds: GHG },
  SCOPE2_MARKET_MISSING: { severity: "warning", kinds: GHG },
  GAS_BREAKDOWN_MISSING: { severity: "warning", kinds: GHG },
  BIOGENIC_IN_SCOPE: { severity: "error", kinds: GHG },
  BIOGENIC_NOT_SHOWN: { severity: "warning", kinds: GHG },
  SCOPE3_CATEGORY_UNADDRESSED: { severity: "error", kinds: GHG },
  EXCLUSION_NO_REASON: { severity: "error", kinds: GHG },
  SCOPE3_DQ_MISSING: { severity: "warning", kinds: GHG },
  EF_SOURCE_MISSING: { severity: "error", kinds: GHG },
  GWP_MIXED: { severity: "warning", kinds: GHG },
  RESPONSIBLE_PERSON_MISSING: { severity: "warning", kinds: GHG },
  UNCERTAINTY_MISSING: { severity: "info", kinds: GHG },
  VERIFICATION_STATEMENT_MISSING: { severity: "warning", kinds: GHG },
  INTENSITY_MISSING: { severity: "warning", kinds: GHG },
  TOTAL_MISMATCH: { severity: "error", kinds: GHG },
  YOY_UNEXPLAINED: { severity: "info", kinds: GHG },
  UNLINKED_DATA: { severity: "info", kinds: BOTH },
  TEXT_TRUNCATED: { severity: "info", kinds: BOTH }, // DS-10
};

export const CHECK_FIXES = ["replace_with_token", "shrink_text", "move_inside", "open_values", "open_inputs"] as const;
export interface Check {
  id: CheckId;
  severity: CheckSeverity;
  pageId?: string;
  elementId?: string;
  message: string;
  details?: unknown;
  fix?: (typeof CHECK_FIXES)[number];
}
/** POST /docs/:id/checks. */
export interface ChecksResponse {
  checks: Check[];
  blocking: boolean;
}

// ---------------------------------------------------------------------------
// §8 AI
// ---------------------------------------------------------------------------

export const AI_ACTIONS = [
  "draft_report",
  "draft_page",
  "headline",
  "body",
  "leadership_draft",
  "about_report",
  "rewrite_shorter",
  "rewrite_longer",
  "rewrite_formal",
  "rewrite_plain",
  "explain_change",
  "add_target_context",
  "chart_title",
  "chart_kind",
  "suggest_layouts",
  "fill_page",
  "alt_text",
  "cover_art",
  "honesty_check",
  "jargon_check",
  "missing_disclosures",
  "design_from_brief",
  "suggest_style",
  "ghg_exec_summary",
  "ghg_methodology_text",
  "scope3_category_text",
  "exclusion_reason_draft",
  "summarise_for_deck",
  "summarise_for_social",
  "apply_brand_voice",
] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

export const SUGGESTION_KINDS = ["text", "elements", "pages", "findings", "image"] as const;
export type SuggestionSource =
  | { source: "kpi"; kpi: string; year: number }
  | { source: "ghg"; metric: GhgMetric; year: number; scope3Category?: number }
  | { source: "input"; key: ReportInputKey };
export interface Suggestion {
  id: string;
  action: AiAction;
  model: string;
  createdAt: string;
  kind: (typeof SUGGESTION_KINDS)[number];
  payload: {
    text?: TextDoc;
    elements?: Element[];
    pages?: FreeformPage[];
    findings?: { message: string; pageId?: string; elementId?: string; severity: CheckSeverity }[];
    assetId?: string;
  };
  sources: SuggestionSource[];
}
export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  suggestions?: Suggestion[];
}
/** POST /docs/:id/ai/chat. */
export interface ChatReply {
  reply: string;
  suggestions: Suggestion[];
}
/** GET /docs/:id/ai/usage (RS plus the company month). */
export interface AiUsage {
  todayUsd: number;
  budgetUsd: number;
  calls: number;
  callBudget: number;
  monthUsd: number;
  monthBudgetUsd: number;
}

// ---------------------------------------------------------------------------
// DS-13 collaboration shapes (mock shapes; DS-13 confirms)
// ---------------------------------------------------------------------------

export interface ReportComment {
  id: number;
  docId: number;
  pageId: string;
  elementId: string | null;
  parentId: number | null;
  body: string;
  authorId: number;
  authorName: string;
  mentions: number[];
  taskAssigneeId: number | null;
  taskDoneAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}
export interface ReportApproval {
  id: number;
  docId: number;
  rev: number;
  requestedBy: number;
  reviewerId: number;
  dueAt: string | null;
  state: ApprovalState;
  note: string | null;
  decidedAt: string | null;
}
/** GET /docs/:id/drift (RS). */
export interface DriftResponse {
  changed: { elementId: string; before: string; after: string }[];
}

// ---------------------------------------------------------------------------
// §9 FE routes
// ---------------------------------------------------------------------------

export const STUDIO_ROUTE_IDS = [
  "studio-home",
  "studio-new",
  "studio-brand-kit",
  "studio-editor",
  "studio-preview",
  "studio-present",
  "studio-versions",
] as const;
export type StudioRouteId = (typeof STUDIO_ROUTE_IDS)[number];

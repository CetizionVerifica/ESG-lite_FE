/**
 * Smart Excel import contracts (XI0), as ESG-lite `src/imports/mapping.ts`
 * defines them. python_AI_service works a MappingProposal out from a
 * workbook for ONE site; the user confirms it on screen; the confirmed
 * proposal goes back with `/v1/excel/preview` and `/v1/excel/import`.
 */

export type MappingSource = "profile" | "rules" | "llm";
export type SheetSource = MappingSource | "mixed";
export type SheetLayout = "rows" | "months_as_columns";

export type ResolvedCategory =
  | { kind: "fixed"; id: number; label: string; confidence: number; source: MappingSource }
  | { kind: "column"; column: string; values: { text: string; id: number | null; confidence: number; source: MappingSource }[] };

export type SheetPeriod =
  | { kind: "column"; column: string }
  | { kind: "monthly_fixed"; date: string }
  | { kind: "yearly"; year_type: "CY" | "FY"; year: number }
  | { kind: "months_as_columns"; columns: { column: string; date: string }[] };

export interface FieldMapping {
  key: string;
  label: string;
  required: boolean;
  column: string | null;
  confidence: number;
  source: MappingSource;
  skipped: boolean;
}

export interface ProposedActivityMatch {
  sheet_text: string;
  category_id: number;
  factor_name: string | null;
  confidence: number;
  source: MappingSource;
  save_mapping: boolean;
}

export interface SiteColumn {
  column: string;
  values: { text: string; matches_site: boolean }[];
}

export interface SheetProposal {
  sheet_name: string;
  fingerprint: string;
  header_row: number;
  data_rows: number;
  layout: SheetLayout;
  /** The site chosen on screen 1; a proposal never changes it. */
  site_id: number;
  site_column: SiteColumn | null;
  category: ResolvedCategory;
  period: SheetPeriod;
  fields: FieldMapping[];
  activities: ProposedActivityMatch[];
  /** Names the model gave that are not in the caller's context; dropped. */
  not_in_context: string[];
  confidence: number;
  source: SheetSource;
  /** Left out of the plan by the user. */
  excluded: boolean;
}

export interface MappingProposal {
  document_id: number;
  site_id: number;
  sheets: SheetProposal[];
  /** Telemetry only. */
  model?: { name: string; calls: number; cached_profile_hits: number };
}

/** A match below this confidence needs the user's eyes before Continue (XI0 `MAPPING_CONFIRM_BELOW`). */
export const CONFIRM_BELOW = 0.8;

/** Row issue severities since XI0 (`info` is new: `PIVOT_EMPTY_CELL`). */
export type IssueSeverity = "error" | "warning" | "info";

/** `ImportRow.meta` (XI0): how a row's mapping was found. Shown in Review rows (XI5). */
export interface RowMeta {
  source: MappingSource;
  confidence: number;
}

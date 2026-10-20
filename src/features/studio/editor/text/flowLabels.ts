// DS-7 · flow section words and groups.
import type { FlowType } from "../../../../lib/studio/contracts";

export const FLOW_TYPE_LABELS: Record<FlowType, string> = {
  toc: "Contents",
  narrative: "Narrative",
  data_tables: "Data tables",
  gri_index: "GRI content index",
  brsr_index: "BRSR index",
  esrs_index: "ESRS index",
  methodology: "Methodology",
  glossary: "Glossary",
  ghgp_index: "GHG Protocol reporting index",
  iso_index: "ISO 14064-1 reporting index",
  ghg_factor_table: "Emission factor table",
  scope3_categories: "Scope 3 categories",
};

export const TEXT_TYPES: ReadonlySet<FlowType> = new Set(["narrative", "methodology", "glossary"]);
export const TABLE_TYPES: ReadonlySet<FlowType> = new Set(["data_tables", "gri_index", "brsr_index", "esrs_index", "ghgp_index", "iso_index", "ghg_factor_table", "scope3_categories"]);

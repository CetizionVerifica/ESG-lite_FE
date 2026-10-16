/**
 * Scope 3 boundary vocabulary (S3-1): category statuses and consolidation
 * approaches, with their labels. Values match ESG-lite
 * src/scope3/boundary/service.ts.
 */
export const BOUNDARY_STATUSES = ["included", "excluded", "not_relevant", "screening"] as const;
export type BoundaryStatus = (typeof BOUNDARY_STATUSES)[number];

export const BOUNDARY_STATUS_LABEL: Record<BoundaryStatus, string> = {
  included: "Included",
  excluded: "Excluded",
  not_relevant: "Not relevant",
  screening: "Screening",
};

/** Statuses that must carry a reason (GHG Protocol: disclose and justify exclusions). */
export const needsReason = (status: BoundaryStatus): boolean => status === "excluded" || status === "not_relevant";

export const CONSOLIDATION_APPROACHES = ["operational_control", "financial_control", "equity_share"] as const;
export type ConsolidationApproach = (typeof CONSOLIDATION_APPROACHES)[number];

export const CONSOLIDATION_LABEL: Record<ConsolidationApproach, string> = {
  operational_control: "Operational control",
  financial_control: "Financial control",
  equity_share: "Equity share",
};

export const isConsolidationApproach = (v: unknown): v is ConsolidationApproach =>
  (CONSOLIDATION_APPROACHES as readonly unknown[]).includes(v);

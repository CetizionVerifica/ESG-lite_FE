// S3-11 leased assets, franchises and investments: labels and the lease
// boundary rule. Mirrors ESG-lite src/scope3/assets/boundary.ts so the Sites
// form shows the note live; the server sends the same note with every site.
import type { ConsolidationApproach } from "./boundary";
import { categoryLabel } from "./contracts";

export const LEASE_ROLES = ["lessee", "lessor", "franchisee", "franchisor"] as const;
export type LeaseRole = (typeof LEASE_ROLES)[number];
export const LEASE_TYPES = ["finance", "operating"] as const;
export type LeaseType = (typeof LEASE_TYPES)[number];
export type LeaseBoundary = "scope12" | "cat8" | "cat13" | "cat14";

/** The Sites form's choices; "none" clears the lease. Franchisee only shows when already set. */
export const LEASE_ROLE_OPTIONS: { value: LeaseRole | "none"; label: string }[] = [
  { value: "none", label: "None" },
  { value: "lessee", label: "We lease it" },
  { value: "lessor", label: "We lease it out" },
  { value: "franchisor", label: "Franchise" },
];

export const LEASE_ROLE_LABEL: Record<LeaseRole, string> = {
  lessee: "We lease it",
  lessor: "We lease it out",
  franchisor: "Franchise",
  franchisee: "We run it as a franchisee",
};

export const LEASE_TYPE_LABEL: Record<LeaseType, string> = { finance: "Finance lease", operating: "Operating lease" };

export const LEASE_BOUNDARY_LABEL: Record<LeaseBoundary, string> = {
  scope12: "Scope 1 and 2",
  cat8: categoryLabel(8),
  cat13: categoryLabel(13),
  cat14: categoryLabel(14),
};

const APPROACH_WORDS: Record<ConsolidationApproach, string> = {
  operational_control: "operational control",
  financial_control: "financial control",
  equity_share: "equity share",
};

export const isLeaseRole = (v: unknown): v is LeaseRole => typeof v === "string" && (LEASE_ROLES as readonly string[]).includes(v);
export const isLeaseType = (v: unknown): v is LeaseType => typeof v === "string" && (LEASE_TYPES as readonly string[]).includes(v);
export const needsLeaseType = (role: LeaseRole | null): boolean => role === "lessee" || role === "lessor";

/**
 *   lessee: finance → Scope 1/2; operating → Scope 1/2 under operational control, else Category 8
 *   lessor: finance → Category 13; operating → Category 13 under operational control, else Scope 1/2
 *   franchisor → Category 14; franchisee → Scope 1/2
 */
export function leaseBoundary(role: unknown, type: unknown, approach: ConsolidationApproach | null | undefined): LeaseBoundary | null {
  if (!isLeaseRole(role)) return null;
  if (role === "franchisor") return "cat14";
  if (role === "franchisee") return "scope12";
  if (!isLeaseType(type)) return null;
  const operational = (approach ?? "operational_control") === "operational_control";
  if (role === "lessee") return type === "finance" || operational ? "scope12" : "cat8";
  return type === "finance" || operational ? "cat13" : "scope12";
}

/** "With financial control, this site's energy belongs in Category 8 · Upstream leased assets." */
export function leaseBoundaryNote(role: unknown, type: unknown, approach: ConsolidationApproach | null | undefined): string | null {
  if (!isLeaseRole(role)) return null;
  const where = leaseBoundary(role, type, approach);
  if (!where) return "Choose the lease type (finance or operating) to see where this site's energy belongs.";
  if (role === "franchisor") return `This site is run by a franchisee: its Scope 1 and 2 belong in ${LEASE_BOUNDARY_LABEL.cat14}.`;
  if (role === "franchisee") return "This franchise site's energy belongs in your Scope 1 and 2.";
  const words = APPROACH_WORDS[approach ?? "operational_control"];
  return `With ${words}, this site's energy belongs in ${where === "scope12" ? "your Scope 1 and 2" : LEASE_BOUNDARY_LABEL[where]}.`;
}

// ── Investments ──────────────────────────────────────────────────────────────
export const INVESTMENT_TYPES = ["equity", "debt", "project"] as const;
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];
export const INVESTMENT_TYPE_LABEL: Record<InvestmentType, string> = { equity: "Equity", debt: "Debt", project: "Project finance" };

export type PlanSkipReason = "below_threshold" | "out_of_scope" | "missing_data";
export const PLAN_SKIP_LABEL: Record<PlanSkipReason, string> = {
  below_threshold: "Below your threshold",
  out_of_scope: "Debt and project finance aren't calculated yet",
  missing_data: "Needs Scope 1+2, or revenue and a sector",
};

/**
 * Scope 3 screening vocabulary (S3-12): the Table II relevance criteria with
 * their guidance wording, the screening input bases and how an estimate was
 * made. Keys match ESG-lite `src/scope3/contracts/schemas.ts` RELEVANCE_KEYS
 * and `src/scope3/screening/rules.ts`.
 */
import type { BoundaryStatus } from "./boundary";
import type { ScreeningBasis } from "./contracts";

/**
 * Table II of the GHG Protocol Scope 3 guidance (Scope 3 Standard Table 6.1):
 * why a category matters. Stored as ticks in `company_scope3_category.relevance`.
 */
export const RELEVANCE_CRITERIA = [
  { key: "size", label: "Size", help: "It contributes significantly to the company's total anticipated Scope 3 emissions." },
  { key: "influence", label: "Influence", help: "There are potential emissions reductions the company could undertake or influence." },
  {
    key: "risk",
    label: "Risk",
    help: "It contributes to the company's climate-related risk exposure: financial, regulatory, supply chain, product and customer, litigation or reputational.",
  },
  { key: "stakeholders", label: "Stakeholders", help: "Key stakeholders (customers, suppliers, investors or civil society) deem it critical." },
  {
    key: "outsourcing",
    label: "Outsourcing",
    help: "Outsourced activities the company used to do in-house, or that other companies in the sector typically do in-house.",
  },
  { key: "sector_guidance", label: "Sector guidance", help: "Sector-specific guidance identifies it as significant." },
  {
    key: "spend_analysis",
    label: "Spending or revenue analysis",
    help: "Areas with a high level of spending or revenue, which are sometimes correlated with high GHG emissions.",
  },
  { key: "other", label: "Other", help: "It meets other relevance criteria the company or its industry sector has set." },
] as const;

export type RelevanceKey = (typeof RELEVANCE_CRITERIA)[number]["key"];
export const RELEVANCE_KEYS = RELEVANCE_CRITERIA.map((c) => c.key) as RelevanceKey[];

export const SCREENING_BASIS_LABEL: Record<ScreeningBasis, string> = {
  spend: "Amount spent",
  revenue: "Revenue",
  headcount: "Headcount",
  mass_sold: "Mass sold",
  other: "Other",
};

/** Bases whose amount is money (they need a currency and give a spend-based estimate with a sector). */
export const isMoneyBasis = (b: ScreeningBasis): boolean => b === "spend" || b === "revenue";

/** Where a category's screening size came from, as the server says (`size_basis`). */
export type SizeBasis = "spend" | "revenue" | "headcount" | "recorded";

export const SIZE_BASIS_LABEL: Record<SizeBasis, string> = {
  spend: "Spend screening",
  revenue: "Revenue screening",
  headcount: "Headcount screening",
  recorded: "Recorded data",
};

/** Currencies a spend estimate converts (ESG-lite S3-5 `SUPPORTED_CURRENCIES`). */
export const SCREENING_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SAR", "BHD"] as const;

/** Below this confidence a suggested sector needs the person's confirmation (spec: ESG-lite asks below 80). */
export const SECTOR_CONFIRM_BELOW = 80;

/** Suggested statuses always come with a reason when they leave a category out. */
export const suggestionNeedsReason = (s: BoundaryStatus) => s === "excluded" || s === "not_relevant";

/** Words on the page for an estimate that is never saved as an emission row. */
export const ESTIMATE_NOTE = "Estimate, not saved";

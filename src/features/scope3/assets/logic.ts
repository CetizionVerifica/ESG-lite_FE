// S3-11 investments register: pure logic. No React here.
import type { InvestmentType } from "../../../lib/scope3/assets";
import type { Investment, InvestmentBody, InvestmentsPlan } from "../../../services/scope3AssetsService";
import { formatTonnes } from "../../../ui/format";

/** How the investee's share is calculated: 15.1 reported emissions, or 15.2 revenue × sector factor. */
export type InvestmentBasis = "reported" | "revenue";

export const BASIS_LABEL: Record<InvestmentBasis, string> = {
  reported: "Investee's reported Scope 1+2",
  revenue: "Revenue and sector (average data)",
};

export type InvestmentDraft = {
  investee: string;
  type: InvestmentType;
  share_pct: number | null;
  basis: InvestmentBasis;
  investee_scope12_tco2e: number | null;
  revenue: number | null;
  currency: string;
  eeio_sector: string;
  year: number | null;
  source: string;
};

export const CURRENCIES = ["USD", "EUR", "INR"] as const;

export const basisOf = (i: Pick<Investment, "investee_scope12_tco2e" | "revenue" | "eeio_sector" | "sector_split">): InvestmentBasis =>
  i.investee_scope12_tco2e === null && (i.revenue !== null || i.eeio_sector !== null || i.sector_split !== null) ? "revenue" : "reported";

export const emptyDraft = (year: number): InvestmentDraft => ({
  investee: "",
  type: "equity",
  share_pct: null,
  basis: "reported",
  investee_scope12_tco2e: null,
  revenue: null,
  currency: "USD",
  eeio_sector: "",
  year,
  source: "",
});

export const draftFrom = (i: Investment): InvestmentDraft => ({
  investee: i.investee,
  type: i.type,
  share_pct: i.share_pct,
  basis: basisOf(i),
  investee_scope12_tco2e: i.investee_scope12_tco2e,
  revenue: i.revenue,
  currency: i.currency ?? "USD",
  eeio_sector: i.eeio_sector ?? "",
  year: i.year,
  source: i.source ?? "",
});

export type DraftErrors = Partial<Record<"investee" | "share_pct" | "investee_scope12_tco2e" | "revenue" | "eeio_sector" | "year", string>>;

/** Field messages; empty when the draft can be saved. Debt and project finance need no emissions data (not calculated yet). */
export function draftErrors(d: InvestmentDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.investee.trim()) e.investee = "Add the investee's name.";
  if (d.share_pct === null) e.share_pct = "Add your share (0 to 100 %).";
  else if (d.share_pct < 0 || d.share_pct > 100) e.share_pct = "Your share must be between 0 and 100 %.";
  if (d.year === null || d.year < 2000 || d.year > 2100) e.year = "Add the reporting year.";
  if (d.type === "equity") {
    if (d.basis === "reported") {
      if (d.investee_scope12_tco2e === null) e.investee_scope12_tco2e = "Add the investee's Scope 1+2.";
      else if (d.investee_scope12_tco2e < 0) e.investee_scope12_tco2e = "Emissions can't be negative.";
    } else {
      if (d.revenue === null) e.revenue = "Add the investee's revenue.";
      else if (d.revenue < 0) e.revenue = "Revenue can't be negative.";
      if (!d.eeio_sector.trim()) e.eeio_sector = "Add the sector, as named on its spend factor.";
    }
  }
  return e;
}

const orNull = (s: string) => s.trim() || null;

/**
 * The body POST/PUT /scope3/investments takes. The basis not chosen is
 * cleared, so the server plans the row the way the drawer shows it.
 * `sector_split` is kept as stored (it has no editor yet).
 */
export function toBody(d: InvestmentDraft, existing?: Investment | null): InvestmentBody {
  const revenue = d.type === "equity" && d.basis === "revenue";
  return {
    investee: d.investee.trim(),
    type: d.type,
    share_pct: d.share_pct ?? 0,
    investee_scope12_tco2e: revenue ? null : d.investee_scope12_tco2e,
    revenue: revenue ? d.revenue : null,
    currency: revenue ? d.currency : null,
    eeio_sector: revenue ? orNull(d.eeio_sector) : null,
    sector_split: revenue ? (existing?.sector_split ?? null) : null,
    year: d.year ?? new Date().getFullYear(),
    source: orNull(d.source),
  };
}

/** The register's "Scope 1+2 or revenue" cell: tCO₂e to 3 decimals (#209), revenue with `fmt`. */
export function dataText(i: Investment, fmt: (n: number) => string): string {
  if (i.investee_scope12_tco2e !== null) return `${formatTonnes(i.investee_scope12_tco2e)} tCO₂e`;
  if (i.revenue !== null) {
    const sector = i.sector_split ? `${Object.keys(i.sector_split).length} sectors` : (i.eeio_sector ?? "no sector");
    return `${fmt(i.revenue)} ${i.currency ?? "USD"} · ${sector}`;
  }
  return "Missing";
}

/** Investments whose share is under the threshold: listed, not planned. */
export const belowThreshold = (rows: Investment[], threshold: number | null): Investment[] =>
  threshold ? rows.filter((i) => i.type === "equity" && i.share_pct < threshold) : [];

/** Years the register can be filtered on: every investment's year plus the current one, newest first. */
export function yearsOf(rows: Investment[], current: number): number[] {
  return [...new Set([current, ...rows.map((r) => r.year)])].sort((a, b) => b - a);
}

/** "2 rows ready · 1 needs a fix", from the plan's counts. */
export function planSummary(p: NonNullable<InvestmentsPlan["plan"]>): string {
  const parts = [`${p.counts.ready} ${p.counts.ready === 1 ? "row" : "rows"} ready`];
  if (p.counts.issue) parts.push(`${p.counts.issue} ${p.counts.issue === 1 ? "needs" : "need"} a fix`);
  return parts.join(" · ");
}

/** A stable idempotency key per plan version, so a double click imports once. */
export const commitKey = (planId: string, version: number) => `scope3-investments-${planId}-${version}`;

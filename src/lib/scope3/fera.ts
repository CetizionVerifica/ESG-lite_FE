/**
 * Category 3 sub-activities of FERA twins (ESG-lite docs/scope3/01-contracts.md
 * §1 `Scope3Sub`, module S3-7). Pages read these labels from here, never
 * their own strings.
 *
 * S3-0 owns src/lib/scope3/; S3-7 wrote this file before S3-0 merged. If
 * S3-0's contracts carry the same list, this file re-exports it.
 */
export const SCOPE3_SUBS = ["3a_upstream_fuels", "3b_upstream_electricity", "3c_td_losses", "3d_resold_energy"] as const;
export type Scope3Sub = (typeof SCOPE3_SUBS)[number];

export const isScope3Sub = (v: unknown): v is Scope3Sub => typeof v === "string" && (SCOPE3_SUBS as readonly string[]).includes(v);

/** Short names, for "(upstream of electricity)" in previews. */
export const SCOPE3_SUB_SHORT: Record<Scope3Sub, string> = {
  "3a_upstream_fuels": "Upstream of fuels",
  "3b_upstream_electricity": "Upstream of electricity",
  "3c_td_losses": "T&D losses",
  "3d_resold_energy": "Resold energy",
};

export const CATEGORY_3_NAME = "Fuel- and energy-related activities";

/** "Category 3 · Upstream of electricity"; a twin saved before S3-7 has no sub-activity. */
export function feraSubLabel(sub: string | null | undefined): string {
  return `Category 3 · ${feraSubShort(sub)}`;
}

/** "Upstream of electricity", without the "Category 3 · " prefix. */
export const feraSubShort = (sub: string | null | undefined): string => (isScope3Sub(sub) ? SCOPE3_SUB_SHORT[sub] : CATEGORY_3_NAME);

/** The sub-activity a new FERA twin gets from its parent's scope, as the backend decides it. */
export const upstreamSubFor = (scope: string | null | undefined): Scope3Sub => (isScope2(scope) ? "3b_upstream_electricity" : "3a_upstream_fuels");

/** "Scope 2", "scope2", "S2". */
export const isScope2 = (scope: string | null | undefined): boolean => /^\s*s(?:cope)?[\s_-]*2\s*$/i.test(scope ?? "");

type Typed = { factor_type?: string | null; year?: number };

/**
 * A site's FERA factors split as the backend uses them: td_loss factors make
 * the T&D-loss twin (Scope 2 rows only), every other factor the upstream twin.
 * With a year, only that year's factors: the backend makes a twin from the
 * target year's factor only, so another year's factor must not show a line
 * the save won't create.
 */
export function splitFeraFactors<F extends Typed>(factors: F[], year?: number | null): { upstream: F[]; tdLoss: F[] } {
  const inYear = year == null ? factors : factors.filter((f) => f.year === year);
  return { upstream: inYear.filter((f) => f.factor_type !== "td_loss"), tdLoss: inYear.filter((f) => f.factor_type === "td_loss") };
}

type Twin = { scope3_sub?: string | null; total_emission?: number | string | null };

const ORDER = (t: Twin) => (isScope3Sub(t.scope3_sub) ? SCOPE3_SUBS.indexOf(t.scope3_sub) : -1);

/** Twins in sub-activity order (3a, 3b, 3c); unlabelled older twins first. */
export const sortTwins = <T extends Twin>(twins: T[]): T[] => [...twins].sort((a, b) => ORDER(a) - ORDER(b));

/** The FERA total a parent carries: every twin linked to it. */
export const twinsTotal = (twins: Twin[]): number => twins.reduce((s, t) => s + Number(t.total_emission ?? 0), 0);

/** The start of every preview line; Add data renders "Cat 3" with its explainer. */
export const CAT3_PREVIEW_PREFIX = "+ Cat 3 ";

/**
 * The Add data line under a row's result, e.g.
 * "+ Cat 3 0.12 tCO₂e (upstream of electricity) + 0.08 tCO₂e (T&D losses), added on save".
 * Null when no part has a value.
 */

export function cat3PreviewText(parts: { sub: Scope3Sub; value: number | null | undefined }[], format: (n: number) => string): string | null {
  const shown = parts.filter((p): p is { sub: Scope3Sub; value: number } => typeof p.value === "number");
  if (!shown.length) return null;
  return `${CAT3_PREVIEW_PREFIX}${shown.map((p) => `${format(p.value)} tCO₂e (${SCOPE3_SUB_SHORT[p.sub].replace(/^Upstream/, "upstream")})`).join(" + ")}, added on save`;
}

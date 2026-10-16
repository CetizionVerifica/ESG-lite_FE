// SE-1 · How much of the calculation a person sees where data is entered
// (Add data, Edit entry, My entries, manual bulk upload). Reviewer screens
// (Approvals, reports, Capture setup) always show the full detail.
//
// A User (contributor) sees their fields and the total tCO₂e only, like the
// old UI, unless their company is set to `entry_detail = "full"`. Managers,
// Admins and Superadmins keep today's detail: factor, unit match, Category 3
// (FERA) rows, method and engine notes. Spec: src/features/add-data/SE-1.CLAUDE.md.
// Pure; the hooks are in ./useCalcDetail.ts.
/** `company.entry_detail` (SE-2 adds the column): "total" (default) or "full". */
export type EntryDetail = "total" | "full";

/** The company fields this reads; a missing value means "total" until SE-2 ships the column. */
export type DetailCompany = { entry_detail?: EntryDetail | string | null } | null | undefined;

const REVIEWER_ROLES = new Set(["Manager", "Admin", "Superadmin"]);

/** True when this person sees the calculation detail (factor, FERA, method, engine notes). */
export const showCalcDetail = (role: string | null | undefined, company?: DetailCompany): boolean =>
  (!!role && REVIEWER_ROLES.has(role)) || company?.entry_detail === "full";

type UserSite = { site_id?: number; company?: DetailCompany };

/** The company of one of the signed-in user's sites (the first when no site is given). */
export function companyOfUserSite(user: unknown, siteId?: number | null): DetailCompany {
  const u = (user ?? {}) as { sites?: UserSite[]; site?: UserSite | null };
  const sites = u.sites?.length ? u.sites : u.site ? [u.site] : [];
  const site = (siteId != null ? sites.find((s) => s.site_id === siteId) : undefined) ?? sites[0];
  return site?.company ?? null;
}

/** What a User reads when a row can't be worked out: something they can act on, no factor words. */
export const USER_MISSING_FACTOR = "We can't work this row out yet. Ask your administrator.";
export const USER_UNIT_CANNOT_CONVERT = "This unit can't be used here. Choose another unit.";

/**
 * A calculation status or row problem in a User's words. The calculator and
 * the engine speak about factors ("No emission factor found for year 2025",
 * "Unit mismatch - this option is per tonne.km…", "The factor is per litre…");
 * a User gets the plain version. Anything about their own input ("Enter
 * Quantity", "Choose a unit") is already plain and passes through.
 */
export function plainProblem(message: string): string {
  if (/no emission factor|no factor|factor has no unit|emission factor .* has no unit/i.test(message)) return USER_MISSING_FACTOR;
  if (/unit mismatch|can't be converted|cannot be converted|no conversion|is per |unit is not configured/i.test(message)) return USER_UNIT_CANNOT_CONVERT;
  return message;
}

/** Engine notes that never block: reviewers see them, Users don't (they can't act on them). */
export const ENGINE_NOTE_CODES = new Set(["FACTOR_FALLBACK_YEAR", "FERA_FACTOR_MISSING", "FACTOR_TYPE_MISMATCH", "WTT_ALREADY_IN_FACTOR", "FX_RATE_FALLBACK", "NO_DEFLATOR"]);

/** Row problem codes about the factor library or units, said plainly to a User. */
const FACTOR_CODES = new Set(["NO_FACTOR_FOR_YEAR", "UNIT_REQUIRED", "NO_FACTOR"]);
const UNIT_CODES = new Set(["UNIT_NOT_CONVERTIBLE"]);

/** One engine issue (code + message) as a User reads it. */
export function plainIssue(code: string, message: string): string {
  if (FACTOR_CODES.has(code)) return USER_MISSING_FACTOR;
  if (UNIT_CODES.has(code)) return USER_UNIT_CANNOT_CONVERT;
  // A name the form doesn't know: keep the "Did you mean" suggestions, they let the User fix the sheet.
  if (code === "UNKNOWN_ACTIVITY") return message.replace(/ matches no emission factor(?: or mapping)?\./i, " isn't one of this form's options.");
  return plainProblem(message);
}

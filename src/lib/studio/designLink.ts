// DS-5 · "Design this report" on the GHG report page (05-ux §9 nav): opens the
// new-design flow for a GHG report with the page's filters carried over.
import type { YearType } from "./contracts";

export interface DesignLinkInput {
  year: number;
  yearType: YearType;
  /** The year the report compares against (the previous year by default). */
  compareYear?: number | null;
  /** Sites picked on the report; empty = every site. */
  siteIds?: number[];
}

/** `/studio/new?kind=ghg&year=&yearType=&compareYear=&siteIds=`. */
export function designThisReportLink(input: DesignLinkInput): string {
  const p = new URLSearchParams({ kind: "ghg", format: "a4", purpose: "report", year: String(input.year), yearType: input.yearType });
  if (input.compareYear && input.compareYear < input.year) p.set("compareYear", String(input.compareYear));
  const sites = [...new Set(input.siteIds ?? [])].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
  if (sites.length) p.set("siteIds", sites.join(","));
  return `/studio/new?${p.toString()}`;
}

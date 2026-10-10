/**
 * The reporting period behind the Period chip and the `?period=` URL param.
 *
 * URL forms (stable, shareable):
 *   month    2025-09
 *   quarter  2025-Q3              (calendar quarter)
 *   CY       CY2025
 *   FY       FY2025               (FY identified by its START year: FY 2025-26)
 *   custom   2025-01-01_2025-06-30
 *
 * The fiscal-year start month is owned by the backend (getReportingCalendar);
 * callers pass it in. 4 (April) matches today's data entry default.
 */
export type Period =
  | { kind: "month"; year: number; month: number }
  | { kind: "quarter"; year: number; quarter: number }
  | { kind: "cy"; year: number }
  | { kind: "fy"; startYear: number }
  | { kind: "custom"; from: string; to: string };

export type PeriodKind = Period["kind"];

export const DEFAULT_FY_START_MONTH = 4;

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Parses a `?period=` value. Returns null for anything it does not recognise. */
export function parsePeriod(value: string | null | undefined): Period | null {
  if (!value) return null;
  const v = value.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})$/.exec(v))) {
    const month = Number(m[2]);
    return month >= 1 && month <= 12 ? { kind: "month", year: Number(m[1]), month } : null;
  }
  if ((m = /^(\d{4})-Q([1-4])$/i.exec(v))) return { kind: "quarter", year: Number(m[1]), quarter: Number(m[2]) };
  // A bare year ("2025", as in a hand-typed or older link) is the calendar year.
  if ((m = /^(?:CY)?(\d{4})$/i.exec(v))) return { kind: "cy", year: Number(m[1]) };
  if ((m = /^FY(\d{4})$/i.exec(v))) return { kind: "fy", startYear: Number(m[1]) };
  if ((m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(v))) {
    const [from, to] = [m[1], m[2]];
    return isValidIsoDate(from) && isValidIsoDate(to) && from <= to ? { kind: "custom", from, to } : null;
  }
  return null;
}

export function serializePeriod(p: Period): string {
  switch (p.kind) {
    case "month":
      return `${p.year}-${pad(p.month)}`;
    case "quarter":
      return `${p.year}-Q${p.quarter}`;
    case "cy":
      return `CY${p.year}`;
    case "fy":
      return `FY${p.startYear}`;
    case "custom":
      return `${p.from}_${p.to}`;
  }
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Inclusive ISO date range covered by a period. */
export function periodRange(p: Period, fyStartMonth = DEFAULT_FY_START_MONTH): { from: string; to: string } {
  switch (p.kind) {
    case "month":
      return { from: `${p.year}-${pad(p.month)}-01`, to: `${p.year}-${pad(p.month)}-${pad(lastDayOfMonth(p.year, p.month))}` };
    case "quarter": {
      const first = (p.quarter - 1) * 3 + 1;
      const last = first + 2;
      return { from: `${p.year}-${pad(first)}-01`, to: `${p.year}-${pad(last)}-${pad(lastDayOfMonth(p.year, last))}` };
    }
    case "cy":
      return { from: `${p.year}-01-01`, to: `${p.year}-12-31` };
    case "fy": {
      if (fyStartMonth === 1) return { from: `${p.startYear}-01-01`, to: `${p.startYear}-12-31` };
      const endMonth = fyStartMonth - 1;
      const endYear = p.startYear + 1;
      return {
        from: `${p.startYear}-${pad(fyStartMonth)}-01`,
        to: `${endYear}-${pad(endMonth)}-${pad(lastDayOfMonth(endYear, endMonth))}`,
      };
    }
    case "custom":
      return { from: p.from, to: p.to };
  }
}

/** "FY 2025-26"; a January-start FY is just "FY 2025". */
export function fyLabel(startYear: number, fyStartMonth = DEFAULT_FY_START_MONTH): string {
  if (fyStartMonth === 1) return `FY ${startYear}`;
  return `FY ${startYear}-${pad((startYear + 1) % 100)}`;
}

function shortDate(iso: string, withYear: boolean): string {
  const [y, m, d] = iso.split("-").map(Number);
  return withYear ? `${d} ${MONTH_SHORT[m - 1]} ${y}` : `${d} ${MONTH_SHORT[m - 1]}`;
}

/** Human label: "Sep 2025", "Q3 2025", "CY 2025", "FY 2025-26", "1 Jan – 30 Jun 2025". */
export function periodLabel(p: Period, fyStartMonth = DEFAULT_FY_START_MONTH): string {
  switch (p.kind) {
    case "month":
      return `${MONTH_SHORT[p.month - 1]} ${p.year}`;
    case "quarter":
      return `Q${p.quarter} ${p.year}`;
    case "cy":
      return `CY ${p.year}`;
    case "fy":
      return fyLabel(p.startYear, fyStartMonth);
    case "custom": {
      const sameYear = p.from.slice(0, 4) === p.to.slice(0, 4);
      return `${shortDate(p.from, !sameYear)} – ${shortDate(p.to, true)}`;
    }
  }
}

/** The period containing `date`, of the given kind (custom spans just that day). */
export function periodContaining(kind: PeriodKind, date: Date, fyStartMonth = DEFAULT_FY_START_MONTH): Period {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  switch (kind) {
    case "month":
      return { kind, year, month };
    case "quarter":
      return { kind, year, quarter: Math.ceil(month / 3) };
    case "cy":
      return { kind, year };
    case "fy":
      return { kind, startYear: month >= fyStartMonth ? year : year - 1 };
    case "custom": {
      const iso = `${year}-${pad(month)}-${pad(date.getDate())}`;
      return { kind, from: iso, to: iso };
    }
  }
}

/** The period `steps` before (negative) or after (positive) `p`. Custom ranges move by their own length. */
export function shiftPeriod(p: Period, steps: number): Period {
  switch (p.kind) {
    case "month": {
      const index = p.year * 12 + (p.month - 1) + steps;
      return { kind: "month", year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
    }
    case "quarter": {
      const index = p.year * 4 + (p.quarter - 1) + steps;
      return { kind: "quarter", year: Math.floor(index / 4), quarter: (((index % 4) + 4) % 4) + 1 };
    }
    case "cy":
      return { kind: "cy", year: p.year + steps };
    case "fy":
      return { kind: "fy", startYear: p.startYear + steps };
    case "custom": {
      const day = 86_400_000;
      const from = Date.parse(`${p.from}T00:00:00Z`);
      const to = Date.parse(`${p.to}T00:00:00Z`);
      const span = (to - from) / day + 1;
      const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      return { kind: "custom", from: iso(from + steps * span * day), to: iso(to + steps * span * day) };
    }
  }
}

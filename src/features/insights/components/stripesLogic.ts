// IN-8 · The emission stripes band: one cell per month on the heat ramp. The
// step a month sits on is display geometry (where its value falls between the
// server's min and max), not a reported figure. Words use server values only.
import type { Stripes } from "../../../lib/insights/contracts";
import { monthLabel } from "../../../lib/insights/labels";
import { formatEmissions } from "../../../ui/format";

/** Fewer months than this hides the band (IN-8 spec). */
export const STRIPES_MIN_MONTHS = 12;

/** Heat step 0–4 for a value between min and max; null stays blank. */
export function heatStep(v: number | null, min: number, max: number): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  if (max <= min) return 2;
  const r = (v - min) / (max - min);
  return Math.max(0, Math.min(4, Math.floor(r * 5 - 1e-9)));
}

export interface StripeCell {
  month: string;
  label: string;
  value: number | null;
  step: number | null;
  text: string;
}

export function stripeCells(s: Stripes): StripeCell[] {
  return s.months.map((m, i) => {
    const value = s.values[i] ?? null;
    const label = monthLabel(m);
    return { month: m, label, value, step: heatStep(value, s.min, s.max), text: `${label}: ${value === null ? "no approved data" : formatEmissions(value)}` };
  });
}

/** True when the band shows (≥ 12 months). */
export const showStripes = (s: Stripes | null | undefined) => !!s && s.months.length >= STRIPES_MIN_MONTHS;

/**
 * "Monthly emissions from Jan 2021 to Sep 2026: 4,300 tCO₂e in the first
 * month and 3,280 tCO₂e in the last; darker is higher." The server sends no
 * change figure for the band, so the sentence gives the two ends, not a %.
 */
export function stripesSentence(s: Stripes): string {
  const known = s.months.map((m, i) => ({ m, v: s.values[i] })).filter((x): x is { m: string; v: number } => x.v !== null && x.v !== undefined);
  if (known.length === 0) return `Monthly emissions from ${monthLabel(s.months[0])} to ${monthLabel(s.months[s.months.length - 1])}: no approved data yet.`;
  const first = known[0];
  const last = known[known.length - 1];
  return `Monthly emissions from ${monthLabel(first.m)} to ${monthLabel(last.m)}: ${formatEmissions(first.v)} in the first month and ${formatEmissions(last.v)} in the last; darker is higher.`;
}

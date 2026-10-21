// Insights words (05-ux §7): status, severity, driver, event kind and
// attention labels, and the plain-words change sentence. Every panel reads its
// labels here so the page says the same thing everywhere. No figure is
// computed here: a change is the server's `change_pct`, only put into words.
import { formatNumber } from "../../ui/format";
import type { AttentionKind, CardSeverity, Driver, EventKind, TargetStatus } from "./contracts";

/** Status words (05-ux §4: a word and an icon, never colour alone). */
export const STATUS_WORD: Record<TargetStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  reached: "Reached",
  no_data: "No data",
};

/** The hero's pathway pill says "No target" when there's no SBTi setup (pathway null). */
export const NO_TARGET = "No target";

export type Tone = "good" | "warn" | "bad" | "neutral";
/** Soft fill + text classes per tone (token colours). */
export const TONE_CLASS: Record<Tone | "info", string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  neutral: "bg-tint text-muted",
};

export const STATUS_TONE: Record<TargetStatus, Tone> = { on_track: "good", at_risk: "warn", off_track: "bad", reached: "good", no_data: "neutral" };

export const SEVERITY_WORD: Record<CardSeverity, string> = { critical: "Critical", attention: "Needs attention", good: "Good news", info: "Worth knowing" };
export const SEVERITY_TONE: Record<CardSeverity, Tone | "info"> = { critical: "bad", attention: "warn", good: "good", info: "info" };

/** Plain driver words (05-ux §4 D). The server's `label` wins; these are the fallback. */
export const DRIVER_LABEL: Record<Driver, string> = {
  activity: "More output",
  intensity_s1: "Better process efficiency",
  energy_intensity_s2: "Less electricity per tonne",
  grid_and_renewables_s2: "Cleaner electricity",
  scope3: "Supply chain (Scope 3)",
  other: "Other",
};

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  initiative: "Initiative",
  acquisition: "Acquisition",
  divestment: "Divestment",
  method_change: "Method change",
  disruption: "Disruption",
  other: "Other",
};

/** The hero's "Needs you" menu. */
export const ATTENTION_LABEL: Record<AttentionKind, string> = {
  approvals: "Waiting for approval",
  kpi_gaps: "KPI values missing",
  off_track: "Targets off track",
  missing_submitters: "Not reported this month",
  threshold: "Above a threshold",
};

/** "12.3" / "8" — one decimal below 10, none from 10 (cards' display rule, 01-contracts §6). */
export const pctNumber = (v: number) => formatNumber(Math.abs(v), Math.abs(v) < 10 && Math.round(Math.abs(v) * 10) % 10 !== 0 ? 1 : 0);

export interface ChangeText {
  arrow: "up" | "down" | "flat";
  /** "+42%" / "−19%" for end labels and chips. */
  short: string;
  /** "down 19% on 2025" (05-ux §7: never "−19%" alone in prose). */
  words: string;
  /** Tone from the server's good/bad (`good` or `direction_good`), neutral without one. */
  tone: Tone;
}

/**
 * A server change in plain words. `good` is the server's verdict (true / false
 * / null); `vs` names what it's compared with ("2025", "the base year").
 */
export function changeText(changePct: number | null | undefined, good: boolean | null | undefined, vs?: string): ChangeText | null {
  if (changePct === null || changePct === undefined || !Number.isFinite(changePct)) return null;
  const rounded = Math.round(changePct * 10) / 10;
  const arrow = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  const n = pctNumber(rounded);
  const short = arrow === "flat" ? "0%" : `${arrow === "up" ? "+" : "−"}${n}%`;
  const words = (arrow === "flat" ? "no change" : `${arrow} ${n}%`) + (vs ? ` on ${vs}` : "");
  const tone: Tone = arrow === "flat" || good === null || good === undefined ? "neutral" : good ? "good" : "bad";
  return { arrow, short, words, tone };
}

/** Whether a change in this direction is good, given which way is good. */
export const goodFor = (changePct: number | null | undefined, directionGood: "up" | "down"): boolean | null =>
  changePct === null || changePct === undefined || changePct === 0 ? null : (changePct > 0) === (directionGood === "up");

/** "Jan 2026" from "2026-01". */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}

/** "tCO₂e" for the contract's "tCO2e", and "tCO₂e/t" etc. */
export const unitText = (u: string) => u.replace(/CO2e/g, "CO₂e");

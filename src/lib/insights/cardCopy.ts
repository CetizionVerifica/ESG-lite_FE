// IN-3 · Insight card copy (01-contracts §6, 05-ux §7): one plain-words
// template per RuleId. The server sends `params` already display-rounded
// (percentages 0 dp, 1 dp below 10); these templates print them as given and
// only add thousands separators. No figure is computed here: a direction word
// ("fell" / "rose", "up" / "down") comes from the card's severity where the
// rule ties it to a direction, otherwise from the sign the server sent.
import { formatNumber } from "../../ui/format";
import { PILLAR_LABEL } from "../kpi/labels";
import { RULES, type CardSeverity, type InsightCard, type RuleId } from "./contracts";
import { unitText } from "./labels";

export type CardParams = Record<string, number | string>;

/** A number exactly as the server sent it, with thousands separators ("1,250", "3.4"). Years and scope numbers use `plain`. */
export function num(v: number | string): string {
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return String(v);
  const abs = Math.abs(v);
  const decimals = (String(abs).split(".")[1] ?? "").length;
  return formatNumber(abs, decimals);
}

/** A year, scope number or name: printed as given, never separated ("2030", not "2,030"). */
const plain = (v: number | string) => String(v);

/** The sign of a number param; strings like "-12" count too. 0 or no sign → null. */
function sign(v: number | string | undefined): 1 | -1 | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 1 : -1;
}

/** "1 target is" / "3 targets are". */
const count = (n: number | string, one: string, many: string) => `${num(n)} ${Number(n) === 1 ? one : many}`;

const pillarName = (p: number | string) => {
  const s = String(p);
  return (PILLAR_LABEL as Record<string, string>)[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
};

type Template = (p: CardParams, severity: CardSeverity) => string;

/** RuleId → sentence (01-contracts §6 copy column, in plain words). */
export const CARD_COPY: Record<RuleId, Template> = {
  decoupling: (p) => `Output is up ${num(p.output_pct)}% since ${plain(p.base_year)} while emissions fell ${num(p.emissions_pct)}%.`,
  largest_source: (p) => `${p.category} is ${num(p.share_pct)}% of your footprint.`,
  site_concentration: (p) => `${p.site} is ${num(p.share_pct)}% of Scope ${plain(p.scope)}.`,
  pathway_gap: (p) => `Emissions are ${num(p.gap_pct)}% above the ${plain(p.target_year)} pathway.`,
  pathway_on_track: (p) => `You're ${num(p.margin_pct)}% below your pathway this year.`,
  target_off_track: (p) => (Number(p.count) === 1 ? `1 target is off track: ${p.first_name}.` : `${count(p.count, "target", "targets")} are off track, including ${p.first_name}.`),
  renewables_jump: (p) => `Renewable electricity rose from ${num(p.from_pct)}% to ${num(p.to_pct)}%.`,
  intensity_change: (p, severity) => {
    // The rule's severity is the server's verdict: lower intensity is good, so a
    // good card fell and an attention card rose. Any other severity → the sign.
    const down = severity === "good" ? true : severity === "attention" ? false : (sign(p.change_pct) ?? 1) < 0;
    return `Intensity ${down ? "fell" : "rose"} ${num(p.change_pct)}% (tCO₂e per ${unitText(String(p.unit))}).`;
  },
  biggest_mover: (p) => {
    const s = sign(p.change_pct);
    return s === null ? `${p.name} changed ${num(p.change_pct)}% on last year.` : `${p.name} is ${s > 0 ? "up" : "down"} ${num(p.change_pct)}% on last year.`;
  },
  coverage_gap: (p) => `${pillarName(p.pillar)} data is ${num(p.pct)}% complete: ${count(p.missing, "value", "values")} missing.`,
  pending_large: (p) => `${count(p.count, "entry", "entries")} waiting for approval could change these figures.`,
};

/**
 * The rule sentence for a card, or null when the FE doesn't know the rule yet
 * or a param the sentence prints is missing (the card is then left out rather
 * than shown with a hole in it).
 */
export function cardText(card: Pick<InsightCard, "rule" | "params" | "severity">): string | null {
  const template = (CARD_COPY as Partial<Record<string, Template>>)[card.rule];
  const needs = (RULES as Partial<Record<string, { params: string[] }>>)[card.rule]?.params.filter((k) => k !== "link") ?? [];
  if (!template) return null;
  const params = card.params ?? {};
  if (needs.some((k) => params[k] === undefined || params[k] === null || params[k] === "")) return null;
  return template(params, card.severity);
}

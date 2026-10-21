// IN-9 · AI wording for insight cards (01-contracts §3 InsightCard, §8).
// The server rewords a card's sentence with `{{v:key}}` tokens in place of
// every figure; the FE fills the tokens from the card's own `params`, so the
// numbers always come from the rule, never from the model. The server guards
// the text (ai/guard.ts); `aiTextUsable` checks it again and the card falls
// back to its rule copy whenever it fails.
import { formatNumber } from "../../ui/format";
import { AI_TEXT_MAX, RULES, type InsightCard } from "./contracts";

/** `{{v:key}}`; keys are the rule's param names. */
const TOKEN = /\{\{v:([A-Za-z0-9_]+)\}\}/g;

/** Param keys that are never shown in the text (a URL is not wording). */
const NOT_IN_TEXT = new Set(["link"]);

/** Years read as years: "2021", not "2,021". */
const isYearKey = (key: string) => /(^|_)year$/.test(key);

/** The decimals the server gave (card params are already rounded for display). */
function givenDecimals(n: number): number {
  const m = /\.(\d+)/.exec(String(n));
  return m ? Math.min(m[1].length, 6) : 0;
}

/** One param as display text: numbers formatted keeping their decimals, years plain, strings as given. */
export function paramText(key: string, value: number | string | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return formatNumber(null);
  if (isYearKey(key) && Number.isInteger(value)) return String(value);
  return formatNumber(value, givenDecimals(value));
}

/** The token keys in a text, in order (repeats kept). */
export function tokenKeys(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[1]);
}

/** Replaces each `{{v:key}}` with its param for display. */
export function fillTokens(text: string, params: Record<string, number | string>): string {
  return text.replace(TOKEN, (_, key: string) => paramText(key, params[key]));
}

/**
 * True only when the card's AI text may be shown: `source: 'ai'`, a non-empty
 * string of at most AI_TEXT_MAX characters, every required param token of the
 * rule present (except `link`), no token the rule doesn't have or the card
 * has no value for, no stray braces, and no digits outside tokens.
 */
export function aiTextUsable(card: Pick<InsightCard, "source" | "text" | "rule" | "params">): card is typeof card & { source: "ai"; text: string } {
  if (card.source !== "ai" || typeof card.text !== "string") return false;
  const text = card.text;
  if (!text.trim() || text.length > AI_TEXT_MAX) return false;
  const rule = RULES[card.rule];
  if (!rule) return false;
  const allowed = new Set(rule.params.filter((k) => !NOT_IN_TEXT.has(k)));
  const used = new Set(tokenKeys(text));
  for (const key of used) if (!allowed.has(key) || !(key in card.params)) return false;
  for (const key of allowed) if (!used.has(key)) return false;
  const outside = text.replace(TOKEN, "");
  if (/[0-9]/.test(outside)) return false;
  if (/[{}]/.test(outside)) return false;
  return true;
}

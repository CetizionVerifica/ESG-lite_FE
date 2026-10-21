import type { InsightsQuery, RuleId } from "../../../lib/insights/contracts";
import { cn } from "../../../ui";
import { usePanel } from "../api";
import { CardSentence } from "./InsightCards";
import { cardSentence } from "./cardSentence";

/**
 * IN-3 · A panel's sentence slot (05-ux §4): the first card among `rules`
 * worded as on the cards, e.g. Decoupling shows `decoupling` above its chart
 * and Pathway shows `pathway_gap` / `pathway_on_track`. It reads the cards
 * panel with the same query key as the cards slot, so no extra request.
 * Nothing renders while loading, on error, or when no rule fired.
 */
export function RuleSentence({ query, rules, className }: { query: InsightsQuery; rules: RuleId[]; className?: string }) {
  const q = usePanel("cards", query);
  const data = q.data?.availability === "ok" ? q.data.data : null;
  const card = data ? data.cards.find((c) => rules.includes(c.rule) && cardSentence(c) !== null) : undefined;
  if (!card) return null;
  return (
    <p data-testid="rule-sentence" data-rule={card.rule} className={cn("text-sm text-ink", className)}>
      <CardSentence card={card} />
    </p>
  );
}

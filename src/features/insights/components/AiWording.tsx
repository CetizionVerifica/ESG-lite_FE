// IN-9 · AI wording on the insight cards (05-ux §4 "Insight cards").
// InsightCards (IN-3) puts `NaturalWordingToggle` in its header (state from
// `useNaturalWording()`, which also feeds `useCardsPanel(query, on)`) and
// renders each card's sentence with `CardWording`.
import { useState, type ReactNode } from "react";
import { aiTextUsable, fillTokens } from "../../../lib/insights/aiText";
import type { InsightCard } from "../../../lib/insights/contracts";
import { AiChip, Toggle, cn, focusRing } from "../../../ui";

/** "Natural wording" on/off for the cards panel. */
export function NaturalWordingToggle({ on, onChange, className }: { on: boolean; onChange: (on: boolean) => void; className?: string }) {
  return (
    <Toggle
      label="Natural wording"
      help="Reworded by AI from the same numbers. Numbers never change."
      checked={on}
      onChange={onChange}
      className={className}
    />
  );
}

/**
 * One card's sentence. Usable AI text shows filled from the card's params with
 * the AI label and a "Show original" button that swaps to the rule copy; any
 * other card (rule source, or AI text that fails the check) shows `ruleText`.
 */
export function CardWording({ card, ruleText, className, headingId }: { card: Pick<InsightCard, "id" | "source" | "text" | "rule" | "params">; ruleText: ReactNode; className?: string; /** Makes the sentence the card's level-3 heading with this id. */ headingId?: string }) {
  const heading = headingId ? ({ id: headingId, role: "heading", "aria-level": 3 } as const) : {};
  const [original, setOriginal] = useState(false);
  if (!aiTextUsable(card)) {
    return (
      <p {...heading} className={cn("text-sm text-ink", className)} data-testid="card-wording" data-source="rule">
        {ruleText}
      </p>
    );
  }
  const filled = fillTokens(card.text, card.params);
  return (
    <div className={cn("flex min-w-0 flex-col items-start gap-1", className)}>
      <p {...heading} className="text-sm text-ink" data-testid="card-wording" data-source={original ? "rule" : "ai"}>
        {original ? (
          ruleText
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {filled}
            <AiChip hint=": reworded by AI from the same numbers" />
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={() => setOriginal((v) => !v)}
        aria-pressed={original}
        className={cn("rounded-control text-xs font-medium text-brand underline-offset-2 hover:underline", focusRing)}
      >
        {original ? "Show natural wording" : "Show original"}
      </button>
    </div>
  );
}

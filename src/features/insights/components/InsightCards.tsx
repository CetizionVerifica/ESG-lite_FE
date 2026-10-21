import { useId } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Crosshair, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import type { CardSeverity, InsightCard } from "../../../lib/insights/contracts";
import { SEVERITY_TONE, SEVERITY_WORD, TONE_CLASS } from "../../../lib/insights/labels";
import { useInsightsQuery } from "../../../lib/insights/query";
import { Button, EmptyState, cn, focusRing } from "../../../ui";
import { SLOTS, slotForPanel } from "../logic";
import type { PanelProps } from "../panels";
import { cardSentence, shownCards } from "./cardSentence";

const SEVERITY_ICON: Record<CardSeverity, typeof CheckCircle2> = {
  critical: OctagonAlert,
  attention: TriangleAlert,
  good: CheckCircle2,
  info: Info,
};

/** A card's severity as icon + word in its tone (colour is never the only signal). */
export function SeverityChip({ severity, className }: { severity: CardSeverity; className?: string }) {
  const Icon = SEVERITY_ICON[severity];
  return (
    <span data-testid="severity-chip" data-severity={severity} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONE_CLASS[SEVERITY_TONE[severity]], className)}>
      <Icon aria-hidden className="size-3.5" />
      {SEVERITY_WORD[severity]}
    </span>
  );
}

/**
 * A card's sentence as inline text (card headings and panel sentence slots).
 * IN-9 swaps in AI text with its AiLabel and "Show original" here.
 */
export function CardSentence({ card }: { card: InsightCard }) {
  return <>{cardSentence(card)}</>;
}

/**
 * IN-3 · "What stands out" (05-ux §4): up to 6 server-ranked cards in a
 * wrapping grid (3 a row at ≥1280, 2 at 768–1024, 1 at 390). Each card: a
 * severity chip, one sentence, "Show" (sets `?panel=` so the PanelShell
 * scrolls to and pulses that panel) and "Open" (the server's `link`).
 */
export function InsightCards({ response }: PanelProps<"cards">) {
  const cards = shownCards(response.data.cards);
  if (cards.length === 0) return <EmptyState compact icon={CheckCircle2} title="No standout changes this period." />;
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="insight-cards">
      {cards.map((card) => (
        <li key={card.id} className="min-w-0">
          <CardItem card={card} />
        </li>
      ))}
    </ul>
  );
}

function CardItem({ card }: { card: InsightCard }) {
  const { panel, set } = useInsightsQuery();
  const headingId = useId();
  const slot = slotForPanel(card.panel ?? null);

  const show = () => {
    if (!card.panel) return;
    if (panel === card.panel) {
      // Already the target: the shell won't re-scroll on its own, so scroll again.
      if (slot) document.querySelector(`[data-testid="panel-${slot}"]`)?.scrollIntoView?.({ block: "start", behavior: "auto" });
      return;
    }
    set({ panel: card.panel });
  };

  return (
    <article aria-labelledby={headingId} data-testid="insight-card" data-rule={card.rule} data-severity={card.severity} className="flex h-full min-w-0 flex-col gap-3 rounded-card border border-line bg-panel p-4">
      <SeverityChip severity={card.severity} className="self-start" />
      <h3 id={headingId} className="text-sm font-medium leading-snug text-ink">
        <CardSentence card={card} />
      </h3>
      {(card.panel || card.link) && (
        <div className="mt-auto flex flex-wrap items-center gap-2">
          {card.panel && (
            <Button size="sm" variant="secondary" icon={<Crosshair aria-hidden className="size-4" />} onClick={show} aria-describedby={headingId} title={slot ? `Show in ${SLOTS[slot].title}` : undefined}>
              Show
            </Button>
          )}
          {card.link && (
            <Link to={card.link} aria-describedby={headingId} className={cn("inline-flex items-center gap-1 rounded-control px-2 py-1 text-sm font-medium text-brand hover:underline", focusRing)}>
              Open
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

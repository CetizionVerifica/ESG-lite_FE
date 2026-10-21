// IN-3 · Which words a card shows, in one place so IN-9 can extend it.
import { MAX_CARDS, type InsightCard } from "../../../lib/insights/contracts";
import { cardText } from "../../../lib/insights/cardCopy";

/**
 * The one place a card's sentence is worded. Today: the rule copy
 * (`cardText`). IN-9 extends this to AI text (source 'ai'); every caller
 * (the cards, panel sentence slots, present mode) then picks that up.
 * null → the FE can't word this card, so it isn't shown.
 */
export function cardSentence(card: InsightCard): string | null {
  return cardText(card);
}

/** The cards the page can word, in the server's order, at most MAX_CARDS. */
export const shownCards = (cards: InsightCard[]) => cards.filter((c) => cardSentence(c) !== null).slice(0, MAX_CARDS);

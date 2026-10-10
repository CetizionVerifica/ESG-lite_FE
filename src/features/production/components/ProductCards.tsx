import { Plus } from "lucide-react";
import { Badge, StatusPill, cn, focusRing, formatNumber } from "../../../ui";
import { type ProductCard, monthLabel as labelFor, periodText } from "../logic";

/**
 * One card per product: latest quantity and where the month stands. A card
 * still to do opens the add drawer for that product and month; the others open
 * the month's record.
 */
export function ProductCards({
  cards,
  month,
  showSite,
  onAdd,
  onOpen,
}: {
  cards: ProductCard[];
  month: string;
  showSite: boolean;
  onAdd: (card: ProductCard) => void;
  onOpen: (card: ProductCard) => void;
}) {
  if (cards.length === 0) return null;
  const monthLabel = labelFor(month);
  return (
    <section aria-labelledby="product-cards" className="space-y-2">
      <h2 id="product-cards" className="text-sm font-semibold text-ink">
        Products · {monthLabel}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="product-cards">
        {cards.map((c) => {
          const state = c.state;
          const todo = state === "todo";
          return (
            <li key={`${c.siteId}:${c.product.product_id}`}>
              <button
                type="button"
                onClick={() => (todo ? onAdd(c) : onOpen(c))}
                aria-label={`${c.product.name}${showSite ? `, ${c.product.site?.name}` : ""}: ${todo ? `to do for ${monthLabel}, add production` : `${c.state} for ${monthLabel}, open the record`}`}
                className={cn("flex h-full w-full flex-col gap-2 rounded-card border border-line bg-panel p-3 text-left hover:bg-tint", focusRing)}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{c.product.name}</span>
                    {showSite && <span className="block truncate text-xs text-muted">{c.product.site?.name}</span>}
                  </span>
                  {todo ? (
                    <Badge tone="neutral" className="shrink-0 gap-1">
                      <Plus aria-hidden className="size-3" />
                      To do
                    </Badge>
                  ) : (
                    <StatusPill status={state} size="sm" className="shrink-0" />
                  )}
                </span>
                <span className="text-sm text-muted">
                  {c.last ? (
                    <>
                      Last: <span className="font-num tabular-nums text-ink">{formatNumber(Number(c.last.quantity), 2)}</span> {c.last.unit} ·{" "}
                      {periodText(c.last.start_date, c.last.end_date)}
                    </>
                  ) : (
                    "Nothing logged yet"
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

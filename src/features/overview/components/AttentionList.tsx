import { CheckCircle2, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, EmptyState, SkeletonText, cn, focusRing } from "../../../ui";
import type { AttentionItem } from "../logic";

const dot = { warn: "bg-warn", bad: "bg-bad", info: "bg-info" } as const;

const rowClass = cn("flex items-center gap-2.5 rounded px-1 py-2 text-sm text-ink hover:bg-tint", focusRing);

function Row({ item }: { item: AttentionItem }) {
  return (
    <>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot[item.tone])} />
      <span className="min-w-0 flex-1">{item.text}</span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
    </>
  );
}

/** What needs the manager today; every row is a link with its count. */
export function AttentionList(props: { items: AttentionItem[]; loading: boolean; error: string | null; onRetry: () => void; className?: string }) {
  const total = props.items.reduce((s, i) => s + i.count, 0);
  return (
    <section aria-labelledby="overview-attention" className={cn("rounded-card border border-line bg-panel p-4", props.className)}>
      <h3 id="overview-attention" className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        Needs your attention
        {!props.loading && total > 0 && <span className="rounded-full bg-warn-soft px-2 py-0.5 font-num text-xs text-warn">{total}</span>}
      </h3>
      {props.loading ? (
        <SkeletonText lines={3} />
      ) : props.error ? (
        <EmptyState compact variant="error" title={props.error} action={<Button size="sm" onClick={props.onRetry}>Try again</Button>} />
      ) : props.items.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-muted">
          <CheckCircle2 aria-hidden className="size-4 text-good" />
          Nothing needs you right now.
        </p>
      ) : (
        <ul className="-mx-1 divide-y divide-line">
          {props.items.map((item) => (
            <li key={item.id}>
              {item.to.startsWith("#") ? (
                // A section on this page: a plain anchor so the browser scrolls to it.
                <a href={item.to} className={rowClass}>
                  <Row item={item} />
                </a>
              ) : (
                <Link to={item.to} className={rowClass}>
                  <Row item={item} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

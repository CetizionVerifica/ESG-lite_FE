import { Link } from "react-router-dom";
import { Factory } from "lucide-react";
import { emissionsParts, formatMonth, formatNumber, panel } from "../../../ui";
import type { Glance } from "../logic";
import { linkButton } from "./linkStyles";

/** Right column: the month's figures and the production reminder. */
export function AtAGlance({ glance, month }: { glance: Glance; month: string }) {
  const t = emissionsParts(glance.tonnes);
  return (
    <aside className="space-y-4" aria-label="Your month at a glance">
      <section className={`${panel} p-4`}>
        <h2 className="text-sm font-semibold text-ink">Your month at a glance</h2>
        <dl className="mt-3 grid grid-cols-3 gap-3 lg:grid-cols-1">
          <div>
            <dt className="text-xs text-muted">Entered</dt>
            <dd className="font-num text-xl font-semibold tabular-nums text-ink">
              {t.value}
              {t.unit && <span className="ml-1 text-xs font-normal text-muted">{t.unit}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Pending entries</dt>
            <dd className="font-num text-xl font-semibold tabular-nums text-ink">{formatNumber(glance.pendingEntries)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Approved entries</dt>
            <dd className="font-num text-xl font-semibold tabular-nums text-ink">{formatNumber(glance.approvedEntries)}</dd>
          </div>
        </dl>
      </section>
      <section className={`${panel} flex items-start gap-3 p-4`}>
        <Factory aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-text" />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="text-sm font-semibold text-ink">Production data</h2>
          <p className="text-xs text-muted">Add your site's production for {formatMonth(month)} so intensity can be worked out.</p>
          <Link to={`/production?period=${month}`} className={linkButton.secondarySm}>
            Add production
          </Link>
        </div>
      </section>
    </aside>
  );
}

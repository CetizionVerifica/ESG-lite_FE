import { Leaf } from "lucide-react";
import { DIRECTION_LABELS, categoryLabel, methodLabel } from "../../lib/scope3/labels";
import { GHG_CATEGORIES } from "../../lib/scope3/contracts";
import { EmptyState, PageHeader, panel } from "../../ui";

/**
 * Settings → Scope 3 (S3-0 placeholder, Admin and Superadmin). Lists the 15
 * GHG Protocol categories and their methods, read-only, until S3-1 replaces
 * it with the company boundary page.
 */
export default function Scope3Placeholder() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Scope 3"
        description="The 15 GHG Protocol categories ESGLite reports Scope 3 in, and the ways each one can be calculated."
      />

      <div className={panel}>
        <EmptyState
          icon={Leaf}
          title="Choosing your categories is coming soon"
          description="Here you'll mark each category as included, excluded or not relevant for your company, with a reason."
        />
      </div>

      <section aria-labelledby="scope3-categories" className={panel}>
        <h2 id="scope3-categories" className="border-b border-line px-5 py-3 text-base font-semibold text-ink">
          Categories
        </h2>
        <ul className="divide-y divide-line">
          {GHG_CATEGORIES.map((c) => (
            <li key={c.n} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{categoryLabel(c.n)}</p>
                <p className="text-sm text-muted">{c.methods.map((o) => methodLabel(o.key, c.n)).join(" · ")}</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-muted">{DIRECTION_LABELS[c.direction]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

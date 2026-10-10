import { CheckCircle2, CircleDashed, Grid3x3 } from "lucide-react";
import { Callout, EmptyState, SkeletonTableRows, cn, focusRing, panel } from "../../../ui";
import type { Category, Coverage, Site } from "../logic";

export type CoverageMatrixProps = {
  coverage: Coverage | null;
  /** Why there is no matrix (several clients in view, nothing loaded yet). */
  hint?: string;
  loading?: boolean;
  onOpenForm: (formId: number) => void;
  onCreate: (site: Site, category: Category) => void;
};

/**
 * Site rows × category columns. A configured cell opens its form; a missing
 * cell starts a new form for that site and category. Status shows as an icon
 * and words for screen readers, never colour alone.
 */
export function CoverageMatrix({ coverage, hint, loading, onOpenForm, onCreate }: CoverageMatrixProps) {
  if (loading) {
    return (
      <section aria-label="Form coverage" className={cn(panel, "p-4")}>
        <SkeletonTableRows rows={3} />
      </section>
    );
  }
  if (!coverage) {
    return hint ? <Callout tone="info">{hint}</Callout> : null;
  }
  if (!coverage.rows.length || !coverage.categories.length) {
    return (
      <section aria-label="Form coverage" className={panel}>
        <EmptyState icon={Grid3x3} title="No categories to cover." description="These sites don't report any category yet. Add categories to a site in Setup → Sites." />
      </section>
    );
  }

  return (
    <section aria-labelledby="coverage-title" className={cn(panel, "overflow-hidden")} data-testid="coverage-matrix">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="coverage-title" className="text-sm font-semibold text-ink">
          Coverage
        </h2>
        <p className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 aria-hidden className="size-3.5 text-good" /> {coverage.configured} configured
          </span>
          <span className="inline-flex items-center gap-1">
            <CircleDashed aria-hidden className="size-3.5 text-bad" /> {coverage.missing} missing
          </span>
          <span>— not reported</span>
        </p>
      </div>
      <div className="max-h-[22rem] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Which site and category pairs have a data-entry form</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-20 border-b border-line bg-panel px-3 py-2 text-left text-xs font-medium text-muted">
                Site
              </th>
              {coverage.categories.map((c) => (
                <th
                  key={c.category_id}
                  scope="col"
                  className="sticky top-0 z-10 min-w-[6.5rem] max-w-[9rem] border-b border-line bg-panel px-2 py-2 text-center align-bottom text-xs font-medium text-muted"
                >
                  <span className="line-clamp-2" title={c.category_name}>
                    {c.category_name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coverage.rows.map(({ site, cells }) => (
              <tr key={site.site_id}>
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-b border-line bg-panel px-3 py-1.5 text-left font-medium text-ink">
                  {site.name}
                </th>
                {cells.map((cell, i) => {
                  const cat = coverage.categories[i];
                  const where = `${site.name}, ${cat.category_name}`;
                  return (
                    <td key={cat.category_id} className="border-b border-line px-1 py-1 text-center">
                      {cell.state === "configured" ? (
                        <button
                          type="button"
                          onClick={() => onOpenForm(cell.formIds[0])}
                          className={cn("inline-flex size-8 items-center justify-center rounded-control text-good hover:bg-good-soft", focusRing)}
                          aria-label={`${where}: configured${cell.formIds.length > 1 ? ` (${cell.formIds.length} forms)` : ""}. Open form`}
                          title={cell.formIds.length > 1 ? `${cell.formIds.length} forms` : "Open form"}
                          data-state="configured"
                        >
                          <CheckCircle2 aria-hidden className="size-4" />
                          {cell.formIds.length > 1 && <span className="ml-0.5 text-[10px] font-num">{cell.formIds.length}</span>}
                        </button>
                      ) : cell.state === "missing" ? (
                        <button
                          type="button"
                          onClick={() => onCreate(site, cat)}
                          className={cn("inline-flex size-8 items-center justify-center rounded-control text-bad hover:bg-bad-soft", focusRing)}
                          aria-label={`${where}: missing. Create form`}
                          title="Create form"
                          data-state="missing"
                        >
                          <CircleDashed aria-hidden className="size-4" />
                        </button>
                      ) : (
                        <span className="text-muted" aria-label={`${where}: not reported`} data-state="na">
                          —
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import { Button, TextField, cn, focusRing } from "../../../../ui";
import { categoryLabel } from "../../../../lib/scope3/labels";
import { methodHint, methodLabel } from "../../../../lib/scope3/dq";
import type { BuilderDraft } from "../../builder";
import { methodCandidates, offerCategoryMethods, setMethodUnits, toggleMethodOption, unitsText } from "../../methodOptions";

export type MethodsOfferedProps = {
  draft: BuilderDraft;
  onChange: (update: (d: BuilderDraft) => BuilderDraft) => void;
  /** The form's GHG Protocol category (1–15); the section shows only for a Scope 3 category. */
  ghgCategory: number;
};

/**
 * S3-3 "Methods offered": which calculation methods contributors can pick on
 * this form, most specific first (the first is the default), each with the
 * units it offers. Saved as `method_options`.
 */
export function MethodsOffered({ draft, onChange, ghgCategory: n }: MethodsOfferedProps) {
  const candidates = methodCandidates(draft, n);
  const offered = draft.methodOptions;
  return (
    <section aria-labelledby="methods-offered-title" className="space-y-3 border-b border-line pb-4" data-testid="methods-offered">
      <div className="space-y-1">
        <h3 id="methods-offered-title" className="text-sm font-medium text-ink">
          Methods offered
        </h3>
        <p className="text-xs text-muted">
          {categoryLabel(n)}. Contributors pick one of these when they add data; the first, most specific one is the default. With none ticked, the form doesn't limit the
          method.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Methods offered">
        {candidates.map((m) => {
          const on = offered.some((o) => o.method === m);
          return (
            <button
              key={m}
              type="button"
              role="checkbox"
              aria-checked={on}
              title={methodHint(m)}
              onClick={() => onChange((d) => toggleMethodOption(d, m, n))}
              className={cn("rounded-chip border px-2.5 py-1 text-xs", on ? "border-brand bg-brand text-on-brand" : "border-line bg-panel text-ink hover:bg-tint", focusRing)}
            >
              {methodLabel(m, n)}
            </button>
          );
        })}
      </div>
      {offered.length === 0 && candidates.length > 0 && (
        <Button size="sm" variant="secondary" onClick={() => onChange((d) => offerCategoryMethods(d, n))}>
          Offer all {candidates.length} methods
        </Button>
      )}
      {offered.length > 0 && (
        <ol className="space-y-2">
          {offered.map((o, i) => (
            <li key={o.method} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end" data-method-option={o.method}>
              <p className="text-sm text-ink">
                <span className="mr-1.5 font-num text-xs text-muted">{i + 1}.</span>
                {methodLabel(o.method, n)}
                {i === 0 && <span className="ml-1.5 text-xs text-muted">(default)</span>}
              </p>
              <TextField
                label={`Units for ${methodLabel(o.method, n)}`}
                value={unitsText(o.units)}
                onChange={(v) => onChange((d) => setMethodUnits(d, o.method, v))}
                placeholder="e.g. kg, tonne"
                help="Comma-separated; the entry offers only these."
                error={o.units.some((u) => u.trim()) ? undefined : "Enter at least one unit."}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

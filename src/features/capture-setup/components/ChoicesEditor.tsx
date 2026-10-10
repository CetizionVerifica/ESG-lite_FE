import { type ReactNode, useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button, cn, focusRing, inputBase } from "../../../ui";
import { type ChoiceDraft, editChoice, newChoice, slugify } from "../logic";

export type ChoicesEditorProps = {
  choices: ChoiceDraft[];
  onChange: (choices: ChoiceDraft[]) => void;
  /** Per-choice errors, by draft key. */
  errors: Record<string, string>;
  title?: ReactNode;
  /** Line under the title; null hides it. */
  help?: ReactNode | null;
  /** Saved choices keep their label too (form choices: paths and factor rules use labels). */
  lockSavedLabels?: boolean;
};

/**
 * Default choices of a Select column. Contributors see the label. A new
 * choice's stored value follows its label until edited under "Show stored
 * values"; a saved choice's stored value is read-only, since entries use it.
 */
export function ChoicesEditor({ choices, onChange, errors, title = "Choices", help = "Each form can override these for its own site.", lockSavedLabels = false }: ChoicesEditorProps) {
  const titleId = useId();
  const [showValues, setShowValues] = useState(() => choices.some((c) => c.value !== slugify(c.label)));
  const update = (key: string, p: Partial<Pick<ChoiceDraft, "label" | "value">>) =>
    onChange(choices.map((c) => (c.key === key ? editChoice(c, p, lockSavedLabels) : c)));
  const move = (i: number, by: number) => {
    const next = [...choices];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item);
    onChange(next);
  };

  return (
    <div role="group" aria-labelledby={titleId} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id={titleId} className="text-sm font-medium text-ink">
          {title} <span className="font-normal text-muted">({choices.length})</span>
        </h3>
        <Button size="sm" variant="ghost" type="button" onClick={() => setShowValues((v) => !v)} aria-pressed={showValues}>
          {showValues ? "Hide stored values" : "Show stored values"}
        </Button>
      </div>
      {(help || ((showValues || lockSavedLabels) && choices.some((c) => c.original !== undefined))) && (
        <p className="text-xs text-muted">
          {help}
          {showValues && !lockSavedLabels && choices.some((c) => c.original !== undefined) && " Saved choices keep their stored value because entries already use it."}
          {lockSavedLabels && choices.some((c) => c.original !== undefined) && " Saved choices keep their label and stored value: entries, choice paths and factor matches use them."}
        </p>
      )}
      {choices.length === 0 && <p className="rounded-control border border-dashed border-line px-3 py-3 text-sm text-muted">No choices yet. Add the first one.</p>}
      <ol className="space-y-2">
        {choices.map((c, i) => {
          const err = errors[c.key];
          const errId = `choice-err-${c.key}`;
          return (
            <li key={c.key} className="space-y-1">
              <div className="flex items-start gap-1.5">
                <span className="mt-2 w-5 shrink-0 text-right text-xs text-muted font-num">{i + 1}</span>
                <div className={cn("grid flex-1 gap-1.5", showValues && "sm:grid-cols-2")}>
                  <input
                    className={cn(inputBase, "h-9", lockSavedLabels && c.original !== undefined && "bg-tint text-muted")}
                    value={c.label}
                    placeholder="Label, e.g. Recycled"
                    aria-label={`Choice ${i + 1} label`}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? errId : undefined}
                    readOnly={lockSavedLabels && c.original !== undefined}
                    title={lockSavedLabels && c.original !== undefined ? "Choice paths and factor matches use this label, so it can't change here." : undefined}
                    onChange={(e) => update(c.key, { label: e.target.value })}
                  />
                  {showValues && (
                    <input
                      className={cn(inputBase, "h-9 font-mono text-xs", c.original !== undefined && "bg-tint text-muted")}
                      value={c.value}
                      placeholder="stored_value"
                      aria-label={`Choice ${i + 1} stored value`}
                      readOnly={c.original !== undefined}
                      title={c.original !== undefined ? "Saved entries use this value, so it can't change." : undefined}
                      onChange={(e) => update(c.key, { value: e.target.value })}
                    />
                  )}
                </div>
                <button type="button" aria-label={`Move choice ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className={cn("mt-1 rounded-control p-1.5 text-muted hover:bg-tint disabled:opacity-30", focusRing)}>
                  <ArrowUp aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move choice ${i + 1} down`}
                  disabled={i === choices.length - 1}
                  onClick={() => move(i, 1)}
                  className={cn("mt-1 rounded-control p-1.5 text-muted hover:bg-tint disabled:opacity-30", focusRing)}
                >
                  <ArrowDown aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove choice ${c.label || i + 1}`}
                  onClick={() => onChange(choices.filter((x) => x.key !== c.key))}
                  className={cn("mt-1 rounded-control p-1.5 text-muted hover:bg-bad-soft hover:text-bad", focusRing)}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              {err && (
                <p id={errId} className="pl-6 text-xs text-bad">
                  {err}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <Button size="sm" type="button" icon={<Plus aria-hidden className="size-4" />} onClick={() => onChange([...choices, newChoice()])}>
        Add choice
      </Button>
    </div>
  );
}

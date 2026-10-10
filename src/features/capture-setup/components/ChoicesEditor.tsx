import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button, cn, focusRing, inputBase } from "../../../ui";
import { type ChoiceDraft, newChoice, slugify } from "../logic";

export type ChoicesEditorProps = {
  choices: ChoiceDraft[];
  onChange: (choices: ChoiceDraft[]) => void;
  /** Per-choice errors, by draft key. */
  errors: Record<string, string>;
};

/**
 * Default choices of a Select column. Contributors see the label; the stored
 * value follows the label until it is edited under "Show stored values".
 */
export function ChoicesEditor({ choices, onChange, errors }: ChoicesEditorProps) {
  const [showValues, setShowValues] = useState(() => choices.some((c) => !c.auto));
  const update = (key: string, p: Partial<ChoiceDraft>) =>
    onChange(
      choices.map((c) => {
        if (c.key !== key) return c;
        const next = { ...c, ...p };
        if (p.label !== undefined && c.auto) next.value = slugify(p.label);
        if (p.value !== undefined) next.auto = p.value === slugify(next.label);
        return next;
      }),
    );
  const move = (i: number, by: number) => {
    const next = [...choices];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item);
    onChange(next);
  };

  return (
    <div role="group" aria-labelledby="choices-title" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="choices-title" className="text-sm font-medium text-ink">
          Choices <span className="font-normal text-muted">({choices.length})</span>
        </h3>
        <Button size="sm" variant="ghost" type="button" onClick={() => setShowValues((v) => !v)} aria-pressed={showValues}>
          {showValues ? "Hide stored values" : "Show stored values"}
        </Button>
      </div>
      <p className="text-xs text-muted">Each form can override these for its own site.</p>
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
                    className={cn(inputBase, "h-9")}
                    value={c.label}
                    placeholder="Label, e.g. Recycled"
                    aria-label={`Choice ${i + 1} label`}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? errId : undefined}
                    onChange={(e) => update(c.key, { label: e.target.value })}
                  />
                  {showValues && (
                    <input
                      className={cn(inputBase, "h-9 font-mono text-xs")}
                      value={c.value}
                      placeholder="stored_value"
                      aria-label={`Choice ${i + 1} stored value`}
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

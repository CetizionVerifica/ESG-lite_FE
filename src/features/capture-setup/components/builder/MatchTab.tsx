import { useId, useState } from "react";
import { AlertTriangle, Plus, Sparkles, X } from "lucide-react";
import { Button, Callout, Combobox, cn, focusRing, inputBase } from "../../../../ui";
import { type BuilderDraft, choicePaths, generateMappings, mappingRows, plainPath, removeMapping, setMapping } from "../../builder";

export type MatchTabProps = {
  draft: BuilderDraft;
  onChange: (update: (d: BuilderDraft) => BuilderDraft) => void;
  /** Emission categories with a factor for this site and category; null while loading or unavailable. */
  targets: string[] | null;
  targetsError: boolean;
  onGenerated: (added: number) => void;
};

/** Rules mapping a choice path to the emission category whose factor applies. */
export function MatchTab({ draft, onChange, targets, targetsError, onGenerated }: MatchTabProps) {
  const listId = useId();
  const rows = mappingRows(draft, targets);
  const unknown = rows.filter((r) => r.issue === "unknown-target").length;
  const paths = choicePaths(draft).map((p) => p.join("|"));
  const unmapped = paths.filter((p) => !Object.keys(draft.mapping).some((k) => k.toLowerCase() === p.toLowerCase()));
  const [newPath, setNewPath] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          When a contributor's choices match a rule, the entry uses that emission category's factor.
        </p>
        <Button
          size="sm"
          icon={<Sparkles aria-hidden className="size-4" />}
          disabled={!unmapped.length}
          onClick={() => {
            const { added } = generateMappings(draft);
            onChange((d) => generateMappings(d).draft);
            onGenerated(added);
          }}
        >
          Generate from choices{unmapped.length ? ` (${unmapped.length})` : ""}
        </Button>
      </div>
      {targetsError && <Callout tone="warn">Couldn't load the emission factors for this site, so targets aren't checked.</Callout>}
      {unknown > 0 && (
        <Callout tone="warn" title={`${unknown} ${unknown === 1 ? "rule points" : "rules point"} to a category with no factor`}>
          Entries that match {unknown === 1 ? "it" : "them"} can't be calculated. Pick a category from the list.
        </Callout>
      )}
      {targets && (
        <datalist id={listId}>
          {targets.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
      {rows.length === 0 ? (
        <p className="rounded-control border border-dashed border-line px-3 py-3 text-sm text-muted">
          No rules yet. {paths.length ? "Generate them from the choices, or add one below." : "Without rules, contributors pick the emission category themselves."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Factor match rules</caption>
            <thead className="bg-tint text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  When the choices are
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Use the factor for
                </th>
                <th scope="col" className="w-10 px-2 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.key} data-rule={r.key}>
                  <td className="px-3 py-2 align-top text-ink">
                    {r.path}
                    {r.issue === "no-path" && <p className="text-xs text-muted">No choice path leads here any more.</p>}
                  </td>
                  <td className="px-3 py-1.5 align-top">
                    <input
                      className={cn(inputBase, "h-8")}
                      list={targets ? listId : undefined}
                      value={r.target}
                      aria-label={`Emission category for ${r.path}`}
                      aria-invalid={r.issue === "unknown-target" ? true : undefined}
                      onChange={(e) => onChange((d) => setMapping(d, r.key, e.target.value))}
                    />
                    {r.issue === "unknown-target" && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-bad">
                        <AlertTriangle aria-hidden className="size-3.5" /> No factor with this name
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <button
                      type="button"
                      aria-label={`Remove rule ${r.path}`}
                      onClick={() => onChange((d) => removeMapping(d, r.key))}
                      className={cn("rounded-control p-1.5 text-muted hover:bg-bad-soft hover:text-bad", focusRing)}
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unmapped.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[14rem] flex-1">
            <Combobox<string>
              label="Add a rule for"
              value={newPath}
              onChange={setNewPath}
              options={unmapped.map((p) => ({ value: p, label: plainPath(p) }))}
              placeholder="Search choice paths"
            />
          </div>
          <Button
            icon={<Plus aria-hidden className="size-4" />}
            disabled={!newPath}
            onClick={() => {
              if (!newPath) return;
              onChange((d) => setMapping(d, newPath, ""));
              setNewPath(null);
            }}
          >
            Add rule
          </Button>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { CornerDownRight, ListTree, Trash2 } from "lucide-react";
import { Button, EmptyState, Select, cn, panel } from "../../../../ui";
import {
  type BuilderDraft,
  choicesUnder,
  dependencyChains,
  fieldTitle,
  isSelect,
  parentBranches,
  parentCandidates,
  removeBranch,
  setBranchChoices,
  setOptions,
  setParent,
} from "../../builder";
import { OptionList } from "../OptionList";

export type ChoicesTabProps = {
  draft: BuilderDraft;
  onChange: (update: (d: BuilderDraft) => BuilderDraft) => void;
  /** The form as it was saved: only its choices are locked. */
  initial: BuilderDraft;
};

/** A field's saved choices (own list, or one branch), found through its column id so key renames don't matter. */
function savedChoices(initial: BuilderDraft, draft: BuilderDraft, field: string, branch?: string) {
  const pk = draft.fields.find((f) => f.column_name === field)?.pk_id;
  const was = initial.fields.find((f) => f.pk_id === pk)?.column_name;
  if (!was) return [];
  return (branch === undefined ? initial.options[was] : initial.dependentOptions[was]?.[branch]) ?? [];
}

/**
 * Each select field's choices for this form. A field can depend on another;
 * its choices are then set per parent choice, shown as a path
 * (Mode › Vehicle › Fuel).
 */
export function ChoicesTab({ draft, onChange, initial }: ChoicesTabProps) {
  const selects = draft.fields.filter(isSelect);
  const [current, setCurrent] = useState<string | null>(selects[0]?.column_name ?? null);
  const field = selects.find((f) => f.column_name === current) ?? selects[0];
  if (!field) {
    return <EmptyState icon={ListTree} title="This form has no select fields." description="Add a Select column on the Fields tab to give contributors choices." compact />;
  }
  const name = field.column_name;
  const parent = draft.dependencies[name] ?? null;
  const chains = dependencyChains(draft);

  return (
    <div className="space-y-4">
      {chains.length > 0 && (
        <p className="text-sm text-muted">
          Depends on:{" "}
          {chains.map((c, i) => (
            <span key={c.join(">")} className="text-ink">
              {i > 0 && "; "}
              {c.map(fieldTitle).join(" › ")}
            </span>
          ))}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Select<string>
          label="Field"
          value={name}
          onChange={(v) => v && setCurrent(v)}
          options={selects.map((f) => ({ value: f.column_name, label: fieldTitle(f.column_name) }))}
        />
        <Select<string>
          label="Choices depend on"
          value={parent}
          onChange={(v) => onChange((d) => setParent(d, name, v))}
          options={parentCandidates(draft, name).map((f) => ({ value: f.column_name, label: fieldTitle(f.column_name) }))}
          placeholder="Nothing (one list)"
          emptyText="Nothing (one list)"
          help={parent ? `Contributors pick ${fieldTitle(parent).toLowerCase()} first.` : undefined}
        />
      </div>

      {!parent ? (
        <OptionList
          key={`own-${name}`}
          title={`${fieldTitle(name)} choices`}
          value={choicesUnder(draft, name)}
          saved={savedChoices(initial, draft, name)}
          onChange={(list) => onChange((d) => setOptions(d, name, list))}
        />
      ) : (
        <Branches draft={draft} initial={initial} field={name} onChange={onChange} />
      )}
    </div>
  );
}

function Branches({ draft, initial, field, onChange }: { draft: BuilderDraft; initial: BuilderDraft; field: string; onChange: ChoicesTabProps["onChange"] }) {
  const branches = parentBranches(draft, field);
  if (!branches.length) {
    return <p className="rounded-control border border-dashed border-line px-3 py-3 text-sm text-muted">{fieldTitle(draft.dependencies[field])} has no choices yet. Add them first.</p>;
  }
  return (
    <ol className="space-y-3" aria-label={`${fieldTitle(field)} choices by ${fieldTitle(draft.dependencies[field]).toLowerCase()}`}>
      {branches.map((b) => (
        <li key={b.key} className={cn(panel, "space-y-2 p-3", !b.reachable && "border-dashed")} data-branch={b.key}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <CornerDownRight aria-hidden className="size-4 text-muted" />
              {b.path.join(" › ")}
            </p>
            {!b.reachable && (
              <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden className="size-4" />} onClick={() => onChange((d) => removeBranch(d, field, b.key))}>
                Remove unused list
              </Button>
            )}
          </div>
          {!b.reachable && <p className="text-xs text-muted">No current choice leads here.</p>}
          <OptionList
            key={`${field}-${b.key}`}
            title={fieldTitle(field)}
            value={choicesUnder(draft, field, b.key)}
            saved={savedChoices(initial, draft, field, b.key)}
            onChange={(list) => onChange((d) => setBranchChoices(d, field, b.key, list))}
          />
        </li>
      ))}
    </ol>
  );
}

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, X } from "lucide-react";
import { Badge, Combobox, TextField, cn, focusRing, inputBase } from "../../../../ui";
import { type BuilderDraft, type ColumnEntity, addField, fieldNameError, fieldTitle, moveField, removeField, renameField } from "../../builder";
import { typeLabel } from "../../logic";

export type FieldsTabProps = {
  draft: BuilderDraft;
  onChange: (update: (d: BuilderDraft) => BuilderDraft) => void;
  library: ColumnEntity[];
  libraryLoading: boolean;
};

/** Form name, the ordered field list, add from the library, keys under "Advanced". */
export function FieldsTab({ draft, onChange, library, libraryLoading }: FieldsTabProps) {
  const [advanced, setAdvanced] = useState(false);
  const available = library
    .filter((c) => !draft.fields.some((f) => f.pk_id === c.pk_id))
    .map((c) => ({ value: c.pk_id, label: `${fieldTitle(c.column_name)} · ${typeLabel(c.column_type)}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-5">
      <TextField label="Form name" required value={draft.name} onChange={(v) => onChange((d) => ({ ...d, name: v }))} error={draft.name.trim() ? undefined : "Enter a form name."} />

      <section aria-labelledby="fields-title" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="fields-title" className="text-sm font-medium text-ink">
            Fields <span className="font-normal text-muted">({draft.fields.length})</span>
          </h3>
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
            className={cn("inline-flex items-center gap-1 rounded-control px-1.5 py-1 text-xs text-muted hover:text-ink", focusRing)}
          >
            {advanced ? <ChevronDown aria-hidden className="size-3.5" /> : <ChevronRight aria-hidden className="size-3.5" />}
            Advanced: field keys
          </button>
        </div>
        {draft.fields.length === 0 && <p className="rounded-control border border-dashed border-line px-3 py-3 text-sm text-muted">No fields yet. Add one from the library below.</p>}
        <ol className="divide-y divide-line rounded-card border border-line">
          {draft.fields.map((f, i) => {
            return (
              <li key={f.pk_id} className="flex flex-wrap items-start gap-2 px-3 py-2" data-field={f.column_name}>
                <span className="mt-1 w-5 shrink-0 text-right text-xs text-muted font-num">{i + 1}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{fieldTitle(f.column_name)}</span>
                    <Badge tone="neutral">{typeLabel(f.column_type)}</Badge>
                  </div>
                  {advanced && <KeyInput draft={draft} field={f} onCommit={(name) => onChange((d) => renameField(d, f.pk_id, name))} />}
                </div>
                <div className="flex items-center">
                  <button type="button" aria-label={`Move ${fieldTitle(f.column_name)} up`} disabled={i === 0} onClick={() => onChange((d) => moveField(d, i, i - 1))} className={cn("rounded-control p-1.5 text-muted hover:bg-tint disabled:opacity-30", focusRing)}>
                    <ArrowUp aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${fieldTitle(f.column_name)} down`}
                    disabled={i === draft.fields.length - 1}
                    onClick={() => onChange((d) => moveField(d, i, i + 1))}
                    className={cn("rounded-control p-1.5 text-muted hover:bg-tint disabled:opacity-30", focusRing)}
                  >
                    <ArrowDown aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${fieldTitle(f.column_name)}`}
                    onClick={() => onChange((d) => removeField(d, f.pk_id))}
                    className={cn("rounded-control p-1.5 text-muted hover:bg-bad-soft hover:text-bad", focusRing)}
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <Combobox<number>
          label="Add a field from the library"
          value={null}
          onChange={(id) => {
            const col = library.find((c) => c.pk_id === id);
            if (col) onChange((d) => addField(d, col));
          }}
          options={available}
          loading={libraryLoading}
          placeholder="Search columns"
          emptyText={library.length ? "Every column is already in this form" : "No columns in the library"}
          help="Select fields bring their library choices; change them on the Choices tab."
        />
      </section>
    </div>
  );
}

/** A field's key, committed on blur or Enter once valid (so a half-typed key never collides with another). */
function KeyInput({ draft, field, onCommit }: { draft: BuilderDraft; field: ColumnEntity; onCommit: (name: string) => void }) {
  const [text, setText] = useState(field.column_name);
  const err = fieldNameError(draft, field.pk_id, text);
  const was = draft.originalNames[field.pk_id];
  const commit = () => {
    if (!err && text.trim() !== field.column_name) onCommit(text.trim());
  };
  return (
    <div className="space-y-1">
      <input
        className={cn(inputBase, "h-8 font-mono text-xs")}
        value={text}
        aria-label={`Key of ${fieldTitle(field.column_name)}`}
        aria-invalid={err ? true : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
      {err ? (
        <p className="text-xs text-bad">{err}</p>
      ) : was && was !== field.column_name ? (
        <p className="text-xs text-warn">Was "{was}". Saved entries for this site and category move to the new key.</p>
      ) : null}
    </div>
  );
}

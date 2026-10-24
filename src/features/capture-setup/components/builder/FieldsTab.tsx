import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, X } from "lucide-react";
import { Badge, Combobox, TextField, cn, focusRing, inputBase } from "../../../../ui";
import { type BuilderDraft, type ColumnEntity, type LibraryName, addField, fieldNameError, fieldTitle, isNumber, isSelect, moveField, removeField, renameField } from "../../builder";
import { typeLabel } from "../../logic";
import { choiceAnswers } from "../../formSettings";
import { FieldSettingsEditor } from "./FieldSettingsEditor";

export type FieldsTabProps = {
  draft: BuilderDraft;
  onChange: (update: (d: BuilderDraft) => BuilderDraft) => void;
  library: ColumnEntity[];
  libraryLoading: boolean;
};

/** Form name, the ordered field list, add from the library, keys under "Advanced". */
export function FieldsTab({ draft, onChange, library, libraryLoading }: FieldsTabProps) {
  const [advanced, setAdvanced] = useState(false);
  // SE-3: which fields have "What contributors see" open.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggleOpen = (key: string) => setOpen((prev) => (prev.has(key) ? new Set([...prev].filter((k) => k !== key)) : new Set([...prev, key])));
  const summary = (key: string) => {
    const st = draft.fieldSettings[key];
    if (!st) return null;
    const parts = [st.label && `"${st.label}"`, st.hidden && "hidden", st.readonly && "read-only", st.required && "required", st.default !== undefined && `default ${st.default}`].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  };
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
                  {advanced && <KeyInput draft={draft} field={f} library={library} onCommit={(name) => onChange((d) => renameField(d, f.pk_id, name))} />}
                  <button
                    type="button"
                    onClick={() => toggleOpen(f.column_name)}
                    aria-expanded={open.has(f.column_name)}
                    className={cn("inline-flex items-center gap-1 rounded-control px-1 py-0.5 text-xs text-brand-text hover:underline", focusRing)}
                  >
                    {open.has(f.column_name) ? <ChevronDown aria-hidden className="size-3.5" /> : <ChevronRight aria-hidden className="size-3.5" />}
                    What contributors see{summary(f.column_name) ? `: ${summary(f.column_name)}` : ""}
                  </button>
                  {open.has(f.column_name) && (
                    <FieldSettingsEditor
                      draft={draft}
                      onChange={onChange}
                      fieldKey={f.column_name}
                      title={fieldTitle(f.column_name)}
                      numeric={isNumber(f)}
                      choices={isSelect(f) ? choiceAnswers(draft, f.column_name).map((o) => ({ value: o.id, label: o.label })) : undefined}
                    />
                  )}
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

      {draft.extraFields.some((f) => f.key.trim()) && (
        <section aria-labelledby="extra-settings-title" className="space-y-2">
          <h3 id="extra-settings-title" className="text-sm font-medium text-ink">
            Extra details: what contributors see
          </h3>
          <ul className="space-y-2">
            {draft.extraFields
              .filter((f) => f.key.trim())
              .map((f) => (
                <li key={f.key} className="space-y-1" data-extra-field={f.key}>
                  <button
                    type="button"
                    onClick={() => toggleOpen(`extra:${f.key}`)}
                    aria-expanded={open.has(`extra:${f.key}`)}
                    className={cn("inline-flex items-center gap-1 rounded-control px-1 py-0.5 text-sm text-ink hover:underline", focusRing)}
                  >
                    {open.has(`extra:${f.key}`) ? <ChevronDown aria-hidden className="size-3.5" /> : <ChevronRight aria-hidden className="size-3.5" />}
                    {f.label || f.key}
                    {summary(f.key) && <span className="text-xs text-muted">· {summary(f.key)}</span>}
                  </button>
                  {open.has(`extra:${f.key}`) && (
                    <FieldSettingsEditor
                      draft={draft}
                      onChange={onChange}
                      fieldKey={f.key}
                      title={f.label || f.key}
                      numeric={f.type === "number"}
                      choices={f.type === "select" ? (f.options ?? []).filter((o) => o.trim()).map((o) => ({ value: o, label: o })) : undefined}
                    />
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A field's key, committed on blur or Enter once valid (so a half-typed key never collides with another). */
function KeyInput({ draft, field, library, onCommit }: { draft: BuilderDraft; field: ColumnEntity; library: LibraryName[]; onCommit: (name: string) => void }) {
  const [text, setText] = useState(field.column_name);
  const err = fieldNameError(draft, field.pk_id, text, library);
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

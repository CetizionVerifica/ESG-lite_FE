import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Select, TextField, Textarea, Toggle, cn, panel } from "../../../../ui";
import { type BuilderDraft, EXTRA_TYPES, type ExtraFieldDefinition, extraFieldErrors, keyFromLabel } from "../../builder";

export type ExtraTabProps = {
  draft: BuilderDraft;
  onChange: (update: (d: BuilderDraft) => BuilderDraft) => void;
  /** Keys of the extra details saved before this edit; their keys never follow the label. */
  savedKeys: ReadonlySet<string>;
};

const splitList = (text: string) => text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

/** Supplementary fields (PO number, equipment…) saved with the entry but not used in the calculation. */
export function ExtraTab({ draft, onChange, savedKeys }: ExtraTabProps) {
  const errors = extraFieldErrors(draft.extraFields);
  const update = (i: number, patch: Partial<ExtraFieldDefinition>) =>
    onChange((d) => ({
      ...d,
      extraFields: d.extraFields.map((f, j) => {
        if (j !== i) return f;
        const next = { ...f, ...patch };
        // A new detail's key follows its label until someone edits the key; saved entries use a saved key.
        if (patch.label !== undefined && !savedKeys.has(f.key) && (!f.key || f.key === keyFromLabel(f.label))) next.key = keyFromLabel(patch.label);
        return next;
      }),
    }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Extra details are saved with each entry. They don't change the calculation.</p>
      {draft.extraFields.length === 0 && <p className="rounded-control border border-dashed border-line px-3 py-3 text-sm text-muted">No extra details.</p>}
      <ol className="space-y-3">
        {draft.extraFields.map((f, i) => (
          <li key={`${i}-${draft.extraFields.length}`} className={cn(panel, "space-y-3 p-3")} data-extra={f.key}>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Label" required value={f.label} onChange={(v) => update(i, { label: v })} error={errors[i] === "Enter a label." ? errors[i] : undefined} />
              <TextField
                label="Key"
                required
                value={f.key}
                onChange={(v) => update(i, { key: v.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                className="font-mono"
                help={savedKeys.has(f.key) ? "Saved entries use this key; changing it asks before saving." : undefined}
                error={errors[i] && errors[i] !== "Enter a label." && errors[i] !== "Add at least one choice." ? errors[i] : undefined}
              />
              <Select<ExtraFieldDefinition["type"]> label="Type" value={f.type} onChange={(v) => v && update(i, { type: v })} options={EXTRA_TYPES} />
              <Toggle label="Required" checked={f.required} onChange={(v) => update(i, { required: v })} inlineLabel={f.required ? "Required" : "Optional"} />
            </div>
            {f.type === "select" && (
              <Textarea
                label="Choices"
                rows={2}
                value={(f.options ?? []).join("\n")}
                onChange={(v) => update(i, { options: v.split("\n") })}
                help="One per line."
                error={errors[i] === "Add at least one choice." ? errors[i] : undefined}
              />
            )}
            <ShowFor value={f.show_for ?? []} onChange={(list) => update(i, { show_for: list })} />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 aria-hidden className="size-4" />}
                onClick={() => onChange((d) => ({ ...d, extraFields: d.extraFields.filter((_, j) => j !== i) }))}
              >
                Remove {f.label.trim() || "detail"}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <Button
        icon={<Plus aria-hidden className="size-4" />}
        onClick={() => onChange((d) => ({ ...d, extraFields: [...d.extraFields, { key: "", label: "", type: "text", required: false }] }))}
      >
        Add extra detail
      </Button>
    </div>
  );
}

/** Comma-separated words, kept as typed and turned into a list on blur. */
function ShowFor({ value, onChange }: { value: string[]; onChange: (list: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return (
    <TextField
      label="Show only for"
      value={text}
      onChange={setText}
      onBlur={() => onChange(splitList(text))}
      help="Emission categories containing any of these words, comma-separated. Leave empty to always show."
    />
  );
}

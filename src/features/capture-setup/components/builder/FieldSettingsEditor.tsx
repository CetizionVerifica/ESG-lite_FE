import { Select, TextField, Toggle } from "../../../../ui";
import type { FieldSetting } from "../../../../lib/forms/settings";
import type { BuilderDraft } from "../../builder";
import { setFieldSetting } from "../../formSettings";

export type FieldSettingsEditorProps = {
  draft: BuilderDraft;
  onChange: (update: (d: BuilderDraft) => BuilderDraft) => void;
  /** A column name or an extra-field key. */
  fieldKey: string;
  /** The field's usual title, shown as the label placeholder. */
  title: string;
  /** Choices of a select field (its default must be one of them). */
  choices?: { value: string; label: string }[];
  /** A number field's default must be a number. */
  numeric?: boolean;
};

/**
 * SE-3 · What a contributor sees for one field: its label and help in the
 * client's words, a default, and whether it is hidden, read-only or required.
 * A hidden field with a default is filled in by the server (SE-2).
 */
export function FieldSettingsEditor({ draft, onChange, fieldKey, title, choices, numeric }: FieldSettingsEditorProps) {
  const s: FieldSetting = draft.fieldSettings[fieldKey] ?? {};
  const set = (patch: Partial<FieldSetting>) => onChange((d) => setFieldSetting(d, fieldKey, patch));
  const id = fieldKey.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const defaultText = s.default === undefined ? "" : String(s.default);
  const defaultError = numeric && defaultText.trim() && !Number.isFinite(Number(defaultText)) ? "Enter a number." : undefined;
  return (
    <div className="grid gap-3 rounded-control border border-line bg-tint/40 p-3 sm:grid-cols-2" data-field-settings={fieldKey}>
      <TextField id={`fs-${id}-label`} label="Label contributors see" value={s.label ?? ""} onChange={(v) => set({ label: v })} placeholder={title} />
      <TextField id={`fs-${id}-help`} label="Help" value={s.help ?? ""} onChange={(v) => set({ help: v })} placeholder="Shown under the field" />
      {choices ? (
        <Select<string>
          label="Default"
          value={defaultText}
          onChange={(v) => set({ default: v ?? "" })}
          options={[{ value: "", label: "No default" }, ...choices]}
        />
      ) : (
        <TextField id={`fs-${id}-default`} label="Default" value={defaultText} onChange={(v) => set({ default: v })} placeholder="No default" error={defaultError} />
      )}
      <div className="flex flex-col gap-2 sm:pt-5">
        <Toggle label={`Hide ${title}`} hideLabel checked={!!s.hidden} onChange={(on) => set({ hidden: on })} inlineLabel={s.hidden ? "Hidden: the server fills the default" : "Shown"} />
        <Toggle label={`${title} read-only`} hideLabel checked={!!s.readonly} onChange={(on) => set({ readonly: on })} inlineLabel={s.readonly ? "Read-only" : "Editable"} disabled={!!s.hidden} />
        <Toggle label={`${title} required`} hideLabel checked={!!s.required} onChange={(on) => set({ required: on })} inlineLabel={s.required ? "Required" : "Optional"} />
      </div>
    </div>
  );
}

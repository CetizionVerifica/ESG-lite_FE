import { useMemo, useState } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { applyChange, columnTitle, formColumns, isColumnVisible, newRow, offeredUnits, rowMethodChoices, setExtraField, toFormModel, visibleExtraFields, type FormModel } from "../../../../lib/emissions/form";
import type { UnitOptionsByActivity } from "../../../../lib/emissions/unitOptions";
import { settingFor, withDefaults } from "../../../../lib/forms/settings";
import { ROW_METHOD_COLUMN, resolveSpecMethod } from "../../../../lib/emissions/emissionCalc";
import type { ModalRow } from "../../../../lib/emissions/types";
import { Badge, Button, DynamicField, MethodCards, NumberField, SegmentedControl, Select, TextField, Textarea, cn, panel } from "../../../../ui";
import { type BuilderDraft, toPreviewConfig } from "../../builder";

export type PreviewProps = {
  draft: BuilderDraft;
  formId: number;
  siteName?: string;
  categoryName?: string;
  /** GHG Protocol category: methods are worded the category's way (S3-3). */
  ghgCategory?: number | null;
  /** #254: the site × category's units and the units each emission category offers (#183), as Add data reads them. */
  units?: { units: string[]; unitOptions?: UnitOptionsByActivity | null } | null;
};

/** A new preview row, with the form's defaults (SE-3). */
const freshRow = (model: FormModel) => withDefaults(newRow(model, 1), model.settings.fieldSettings, model.extraFields.map((f) => f.key));

/**
 * The entry row contributors see in Add data, built from the unsaved draft
 * with the same form rules, so every edit shows here at once. Values typed
 * here are never saved. "Contributor view" applies what the form fixes for a
 * User (SE-1, SE-3): hidden fields left out, the client's labels and help,
 * read-only fields, no method words. "Reviewer view" shows every field and the
 * method cards.
 */
export function Preview({ draft, formId, siteName, categoryName, ghgCategory, units }: PreviewProps) {
  const model = useMemo(() => toFormModel(toPreviewConfig(draft, formId), units?.unitOptions ?? null), [draft, formId, units?.unitOptions]);
  const [row, setRow] = useState<ModalRow>(() => freshRow(model));
  // Contributors only see the form's default method; a reviewer picks between them (simple-entry §8).
  const [viewAs, setViewAs] = useState<"contributor" | "manager">("contributor");
  const contributor = viewAs === "contributor";
  const settings = model.settings.fieldSettings;
  const hidden = (key: string) => contributor && !!settingFor(settings, key)?.hidden;
  const columns = formColumns(model).filter((c) => isColumnVisible(model, c, row) && !hidden(c.column_name));
  const extras = visibleExtraFields(model, row).filter((f) => !hidden(f.key));
  const mapped = Object.keys(model.mapping).length > 0;
  const methods = rowMethodChoices(model);
  // A method the draft no longer offers falls back to its first, as a new row in Add data would start.
  const method = methods.includes(String(row[ROW_METHOD_COLUMN] ?? "")) ? String(row[ROW_METHOD_COLUMN]) : (model.methodOptions[0]?.method ?? null);
  const unit = row.activity_data_unit || (model.spec ? resolveSpecMethod(model.spec, row)?.method.activity_unit : undefined);
  // #254: the Unit field a contributor gets in Add data. With the #183 lists it waits for the emission
  // category and offers that category's units; otherwise the site's units. A fixed unit is text.
  const fixedUnit = model.settings.fixedUnit;
  const waitsForCategory = !!model.unitOptions && !row.emission_category;
  const unitChoices = waitsForCategory ? [] : (offeredUnits(model, row) ?? [...new Set([...(unit ? [unit] : []), ...(units?.units ?? [])])]);

  return (
    <section aria-labelledby="preview-title" className={cn(panel, "space-y-4 p-4")} data-testid="form-preview">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="preview-title" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Eye aria-hidden className="size-4 text-muted" /> Live preview
          </h2>
          <p className="text-xs text-muted">
            What {viewAs === "manager" ? "Managers" : "contributors"} see{siteName && categoryName ? ` at ${siteName} for ${categoryName}` : ""}. Nothing typed here is saved.
          </p>
        </div>
        <Button size="sm" variant="ghost" icon={<RotateCcw aria-hidden className="size-4" />} onClick={() => setRow(freshRow(model))}>
          Clear
        </Button>
      </div>

      <SegmentedControl
        label="Preview as"
        size="sm"
        options={[
          { value: "contributor", label: "Contributor view" },
          { value: "manager", label: "Reviewer view" },
        ]}
        value={viewAs}
        onChange={(v) => {
          setViewAs(v);
          // Back to the contributor's view: the row starts on the form's default method again.
          const first = model.methodOptions[0]?.method;
          if (v === "contributor" && first) setRow((r) => applyChange(model, r, ROW_METHOD_COLUMN, first));
        }}
      />

      {/* Contributors don't pick or see a method (simple-entry §8, SE-1); reviewers see the cards. */}
      {!contributor && <MethodCards methods={methods} value={method} onChange={(v) => setRow((r) => applyChange(model, r, ROW_METHOD_COLUMN, v))} ghgCategory={ghgCategory} />}

      {columns.length === 0 ? (
        <p className="rounded-control border border-dashed border-line px-3 py-3 text-sm text-muted">No fields yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {columns.map((c) => (
            <DynamicField
              key={c.pk_id}
              model={model}
              column={c}
              row={row}
              onChange={(name, value) => setRow((r) => applyChange(model, r, name, value))}
              labelText={settingFor(settings, c.column_name)?.label ?? columnTitle(c.column_name)}
              help={settingFor(settings, c.column_name)?.help}
              readOnly={contributor && !!settingFor(settings, c.column_name)?.readonly}
              labelExtra={!contributor && settingFor(settings, c.column_name)?.hidden ? <Badge tone="neutral">Hidden from contributors</Badge> : undefined}
            />
          ))}
          {!fixedUnit && (
            <Select<string>
              label="Unit"
              value={waitsForCategory ? null : row.activity_data_unit || null}
              onChange={(v) => setRow((r) => applyChange(model, r, "activity_data_unit", v ?? ""))}
              options={unitChoices.map((u) => ({ value: u, label: u }))}
              placeholder="Choose a unit"
              emptyText={mapped ? "Make your choices above first" : "Choose the emission category first"}
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
        <span className="text-muted">Emission category:</span>
        {row.emission_category ? (
          <Badge tone="good">{row.emission_category}</Badge>
        ) : mapped ? (
          <span className="text-muted">picked from the choices</span>
        ) : (
          <span className="text-muted">contributor picks it</span>
        )}
        {/* A fixed unit is text, as in Add data; any other unit is the Unit field above. */}
        {fixedUnit && (
          <>
            <span className="ml-2 text-muted">Unit:</span>
            <span className="font-num text-ink">{fixedUnit}</span>
            <span className="text-xs text-muted">(fixed)</span>
          </>
        )}
      </div>

      {extras.length > 0 && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-xs font-medium text-muted">More details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {extras.map((f, i) => {
              const value = String(row._extra_data?.[f.key] ?? "");
              const set = (v: string) => setRow((r) => setExtraField(r, f.key, v));
              const st = settingFor(settings, f.key);
              const shown = st?.label ?? (f.label || f.key || "Untitled");
              const common = {
                label: !contributor && st?.hidden ? `${shown} (hidden from contributors)` : shown,
                required: f.required || !!st?.required,
                help: st?.help,
                disabled: contributor && !!st?.readonly,
              };
              if (f.type === "select")
                return <Select<string> key={i} {...common} value={value || null} onChange={(v) => set(v ?? "")} options={(f.options ?? []).filter((o) => o.trim()).map((o) => ({ value: o, label: o }))} placeholder="Select…" />;
              if (f.type === "number")
                return <NumberField key={i} {...common} value={value === "" || !Number.isFinite(Number(value)) ? null : Number(value)} onChange={(n) => set(n === null ? "" : String(n))} />;
              if (f.type === "textarea") return <Textarea key={i} {...common} className="sm:col-span-2" value={value} onChange={set} rows={2} />;
              return <TextField key={i} {...common} type={f.type === "date" ? "date" : "text"} value={value} onChange={set} />;
            })}
          </div>
        </div>
      )}
    </section>
  );
}

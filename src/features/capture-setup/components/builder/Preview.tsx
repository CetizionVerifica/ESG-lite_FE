import { useMemo, useState } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { applyChange, formColumns, isColumnVisible, newRow, setExtraField, toFormModel, visibleExtraFields } from "../../../../lib/emissions/form";
import { resolveSpecMethod } from "../../../../lib/emissions/emissionCalc";
import type { ModalRow } from "../../../../lib/emissions/types";
import { Badge, Button, DynamicField, NumberField, Select, TextField, Textarea, cn, panel } from "../../../../ui";
import { type BuilderDraft, toPreviewConfig } from "../../builder";

export type PreviewProps = {
  draft: BuilderDraft;
  formId: number;
  siteName?: string;
  categoryName?: string;
};

/**
 * The entry row contributors see in Add data, built from the unsaved draft
 * with the same form rules, so every edit shows here at once. Values typed
 * here are never saved.
 */
export function Preview({ draft, formId, siteName, categoryName }: PreviewProps) {
  const model = useMemo(() => toFormModel(toPreviewConfig(draft, formId)), [draft, formId]);
  const [row, setRow] = useState<ModalRow>(() => newRow(model, 1));
  const columns = formColumns(model).filter((c) => isColumnVisible(model, c, row));
  const extras = visibleExtraFields(model, row);
  const mapped = Object.keys(model.mapping).length > 0;
  const unit = row.activity_data_unit || (model.spec ? resolveSpecMethod(model.spec, row)?.method.activity_unit : undefined);

  return (
    <section aria-labelledby="preview-title" className={cn(panel, "space-y-4 p-4")} data-testid="form-preview">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="preview-title" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Eye aria-hidden className="size-4 text-muted" /> Live preview
          </h2>
          <p className="text-xs text-muted">
            What contributors see{siteName && categoryName ? ` at ${siteName} for ${categoryName}` : ""}. Nothing typed here is saved.
          </p>
        </div>
        <Button size="sm" variant="ghost" icon={<RotateCcw aria-hidden className="size-4" />} onClick={() => setRow(newRow(model, 1))}>
          Clear
        </Button>
      </div>

      {columns.length === 0 ? (
        <p className="rounded-control border border-dashed border-line px-3 py-3 text-sm text-muted">No fields yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {columns.map((c) => (
            <DynamicField key={c.pk_id} model={model} column={c} row={row} onChange={(name, value) => setRow((r) => applyChange(model, r, name, value))} />
          ))}
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
        {unit && (
          <>
            <span className="ml-2 text-muted">Unit:</span>
            <span className="font-num text-ink">{unit}</span>
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
              const common = { label: f.label || f.key || "Untitled", required: f.required };
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

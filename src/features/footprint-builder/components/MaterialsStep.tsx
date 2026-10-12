import { useState } from "react";
import { FileUp, Plus, Wand2 } from "lucide-react";
import { Button, EmptyState, NumberField, Tooltip, panel } from "../../../ui";
import type { FactorBook, Line, PickerFactor } from "../logic";
import { LineTable } from "./LineTable";

type Props = {
  lines: Line[];
  factors: PickerFactor[];
  factorsLoading: boolean;
  factorsError: boolean;
  book: FactorBook;
  unitLabel: string;
  onAdd: () => void;
  onChange: (key: string, patch: Partial<Line>) => void;
  onRemove: (line: Line) => void;
  onDetails: (line: Line) => void;
  onApplyYield: (pct: number) => void;
  onImportBom: () => void;
  onSuggest: () => void;
  /** Lines without a factor or supplier footprint: what "Suggest factors" works on. */
  suggestCount: number;
};

/** Step 2: the bill of materials per declared unit, each line priced by a library factor. */
export function MaterialsStep({ lines, factors, factorsLoading, factorsError, book, unitLabel, onAdd, onChange, onRemove, onDetails, onApplyYield, onImportBom, onSuggest, suggestCount }: Props) {
  const [yieldPct, setYieldPct] = useState<number | null>(null);
  return (
    <section aria-labelledby="materials-title" className={`${panel} space-y-4 p-4 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="materials-title" className="text-base font-semibold text-ink">
            Materials (A1)
          </h2>
          <p className="mt-1 text-sm text-muted">What goes into one {unitLabel}, losses included. Factors come from the material factor library.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<FileUp aria-hidden className="size-4" />} onClick={onImportBom}>
            Import BOM
          </Button>
          <Tooltip content={suggestCount ? `Suggest a library factor for ${suggestCount} ${suggestCount === 1 ? "line" : "lines"} without one` : "Every named material already has a factor"}>
            <span>
              <Button icon={<Wand2 aria-hidden className="size-4" />} onClick={onSuggest} disabled={suggestCount === 0 || factorsLoading || factorsError}>
                Suggest factors
              </Button>
            </span>
          </Tooltip>
          <Button variant="primary" icon={<Plus aria-hidden className="size-4" />} onClick={onAdd}>
            Add material
          </Button>
        </div>
      </div>

      {factorsError && <p className="text-sm text-bad">Couldn't load the factor library, so lines can't be priced yet. Reload to try again.</p>}

      {lines.length === 0 ? (
        <EmptyState compact title="No materials yet." description="Add each input that goes into the product, per declared unit." action={<Button onClick={onAdd}>Add material</Button>} />
      ) : (
        <>
          <LineTable
            caption="Materials"
            lines={lines}
            factors={factors}
            factorsLoading={factorsLoading}
            book={book}
            unitLabel={unitLabel}
            recycled
            onChange={onChange}
            onRemove={onRemove}
            onDetails={onDetails}
          />
          <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <NumberField
              label="Process yield"
              unit="%"
              value={yieldPct}
              min={1}
              max={100}
              onChange={setYieldPct}
              placeholder="e.g. 97"
              help="If quantities are net, this scales every material up to cover losses."
              className="w-56"
            />
            <Button
              className="mb-6"
              disabled={!(yieldPct != null && yieldPct > 0 && yieldPct < 100)}
              onClick={() => {
                if (yieldPct == null) return;
                onApplyYield(yieldPct);
                setYieldPct(null);
              }}
            >
              Apply to quantities
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

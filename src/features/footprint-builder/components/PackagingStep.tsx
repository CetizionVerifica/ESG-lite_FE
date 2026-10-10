import { Plus } from "lucide-react";
import { Button, panel } from "../../../ui";
import type { FactorBook, InputStage, Line, PickerFactor } from "../logic";
import { LineTable } from "./LineTable";

type Props = {
  packaging: Line[];
  waste: Line[];
  factors: PickerFactor[];
  factorsLoading: boolean;
  book: FactorBook;
  unitLabel: string;
  onAdd: (stage: InputStage) => void;
  onChange: (key: string, patch: Partial<Line>) => void;
  onRemove: (line: Line) => void;
  onDetails: (line: Line) => void;
};

function Part(props: { id: string; title: string; hint: string; add: string; lines: Line[]; onAdd: () => void } & Omit<Props, "packaging" | "waste" | "onAdd">) {
  const { id, title, hint, add, lines, onAdd, ...table } = props;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={id} className="text-sm font-semibold text-ink">
            {title}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{hint}</p>
        </div>
        <Button icon={<Plus aria-hidden className="size-4" />} onClick={onAdd}>
          {add}
        </Button>
      </div>
      {lines.length === 0 ? <p className="text-sm text-muted">None yet.</p> : <LineTable caption={title} lines={lines} {...table} />}
    </div>
  );
}

/** Step 5: packaging that leaves with each declared unit, and process waste sent to treatment. */
export function PackagingStep({ packaging, waste, onAdd, ...rest }: Props) {
  return (
    <section aria-labelledby="packaging-title" className={`${panel} space-y-6 p-4 sm:p-6`}>
      <h2 id="packaging-title" className="text-base font-semibold text-ink">
        Packaging and waste
      </h2>
      <Part id="pack-title" title="Packaging (A3)" hint={`Reels, drums, pallets and wrap per ${rest.unitLabel}.`} add="Add packaging" lines={packaging} onAdd={() => onAdd("A3_packaging")} {...rest} />
      <Part id="waste-title" title="Process waste (A3)" hint={`Waste per ${rest.unitLabel}, priced by its treatment factor.`} add="Add waste" lines={waste} onAdd={() => onAdd("A3_waste")} {...rest} />
    </section>
  );
}

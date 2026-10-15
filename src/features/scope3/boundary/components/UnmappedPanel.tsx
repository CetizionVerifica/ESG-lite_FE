import { useState } from "react";
import { Badge, Button, Scope3CategoryChip, Select, cn, panel } from "../../../../ui";
import { GHG_CATEGORIES, categoryLabel } from "../../../../lib/scope3/contracts";
import type { MapProposal } from "../../../../services/scope3Service";
import { CONFIRM_ALL_MIN, bulkConfirmable, confidenceText } from "../logic";

const NUMBER_OPTIONS = GHG_CATEGORIES.map((c) => ({ value: c.n as number, label: categoryLabel(c.n) }));

export type UnmappedPanelProps = {
  unmapped: MapProposal[];
  canConfirm: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: (items: { category_id: number; ghg_category: number }[]) => void;
};

/**
 * The client's Scope 3 categories with no GHG Protocol number yet, with the
 * proposed number and how sure the match is. A Superadmin confirms them (D1).
 */
export function UnmappedPanel({ unmapped, canConfirm, busy, error, onConfirm }: UnmappedPanelProps) {
  const [changing, setChanging] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const sure = bulkConfirmable(unmapped);

  return (
    <section aria-labelledby="unmapped-heading" className={cn(panel, "space-y-3 p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="unmapped-heading" className="text-base font-semibold text-ink">
            Unmapped categories <Badge tone="warn">{unmapped.length}</Badge>
          </h2>
          <p className="text-sm text-muted">
            {canConfirm
              ? "Check the proposed GHG Protocol category for each. A confirmed number applies wherever the category is used."
              : "These show as Unmapped in reports until a Superadmin confirms their GHG Protocol category."}
          </p>
        </div>
        {canConfirm && (
          <Button
            variant="primary"
            disabled={!sure.length || busy}
            onClick={() => onConfirm(sure.map((p) => ({ category_id: p.category_id, ghg_category: p.proposed as number })))}
          >
            Confirm all ≥ {CONFIRM_ALL_MIN} %{sure.length ? ` (${sure.length})` : ""}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-bad">
          Nothing was confirmed. {error}
        </p>
      )}
      <ul className="divide-y divide-line">
        {unmapped.map((p) => {
          const editing = changing === p.category_id;
          return (
            <li key={p.category_id} data-testid={`unmapped-${p.category_id}`} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-40 flex-1 font-medium text-ink">{p.category_name}</span>
              <span className="flex items-center gap-2 text-sm text-muted">
                {p.proposed !== null ? <Scope3CategoryChip n={p.proposed} /> : <Scope3CategoryChip n={null} />}
                <span>{confidenceText(p)}</span>
              </span>
              {canConfirm && !editing && (
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={p.proposed === null || busy}
                    onClick={() => onConfirm([{ category_id: p.category_id, ghg_category: p.proposed as number }])}
                    aria-label={`Confirm ${p.category_name}`}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setChanging(p.category_id);
                      setPicked(p.proposed);
                    }}
                    aria-label={`Change number for ${p.category_name}`}
                  >
                    Change number
                  </Button>
                </span>
              )}
              {canConfirm && editing && (
                <span className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                  <Select<number>
                    label={`GHG Protocol category for ${p.category_name}`}
                    hideLabel
                    className="min-w-64"
                    value={picked}
                    options={NUMBER_OPTIONS}
                    placeholder="Choose a category"
                    onChange={setPicked}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={picked === null || busy}
                    onClick={() => {
                      onConfirm([{ category_id: p.category_id, ghg_category: picked as number }]);
                      setChanging(null);
                    }}
                  >
                    Save number
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setChanging(null)}>
                    Cancel
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { Link } from "react-router-dom";
import { Badge, Button, Scope3CategoryChip, Select, TextField, cn, focusRing, panel } from "../../../../ui";
import { BOUNDARY_STATUSES, BOUNDARY_STATUS_LABEL, type BoundaryStatus, needsReason } from "../../../../lib/scope3/boundary";
import { DIRECTION_LABEL } from "../../../../lib/scope3/contracts";
import type { BoundaryCategory } from "../../../../services/scope3Service";
import { type RowDraft, isRowDirty, isUnconfirmedDefault, lastChanged, rowError } from "../logic";

const STATUS_OPTIONS = BOUNDARY_STATUSES.map((s) => ({ value: s, label: BOUNDARY_STATUS_LABEL[s] }));
const STATUS_TONE: Record<BoundaryStatus, "good" | "neutral" | "warn" | "info"> = {
  included: "good",
  excluded: "warn",
  not_relevant: "neutral",
  screening: "info",
};

export type BoundaryTableProps = {
  categories: BoundaryCategory[];
  drafts: Record<number, RowDraft>;
  editable: boolean;
  /** Show reason errors (after a Save attempt), not while typing the first time. */
  showErrors: boolean;
  onChange: (n: number, patch: Partial<RowDraft>) => void;
  /** S3-11 (D10): confirms a default Not relevant row as it is. */
  onConfirmDefault?: (n: number) => void;
  /** The category being confirmed. */
  confirming?: number | null;
};

/** The 15 GHG Protocol categories with the client's status, reason and mapped categories. */
export function BoundaryTable({ categories, drafts, editable, showErrors, onChange, onConfirmDefault, confirming }: BoundaryTableProps) {
  return (
    <div className={cn(panel, "relative overflow-x-auto")}>
      <table className="w-full min-w-[960px] text-left text-sm">
        <caption className="sr-only">Scope 3 categories and whether each is in the boundary</caption>
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Category</th>
            <th scope="col" className="w-40 px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 font-medium">Reason</th>
            <th scope="col" className="px-3 py-2 font-medium">Method note</th>
            <th scope="col" className="px-3 py-2 font-medium">Your categories</th>
            <th scope="col" className="w-36 px-3 py-2 font-medium">Last changed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {categories.map((c) => {
            const d = drafts[c.n];
            const err = showErrors && d ? rowError(d) : null;
            const label = `Category ${c.n}`;
            return (
              <tr key={c.n} data-testid={`boundary-row-${c.n}`} className="align-top">
                <th scope="row" className="px-3 py-2.5 font-normal">
                  <div className="flex items-start gap-2">
                    <Scope3CategoryChip n={c.n} compact />
                    <div className="min-w-0">
                      <div className="font-medium text-ink">{c.name}</div>
                      <div className="text-xs text-muted">{DIRECTION_LABEL[c.direction]}</div>
                      {/* S3-9: the commuting survey behind Category 7. */}
                      {c.n === 7 && (
                        <Link to="/settings/scope3/commuting" className={cn(focusRing, "rounded-control text-xs font-medium text-brand hover:underline")}>
                          Commuting survey
                        </Link>
                      )}
                      {/* S3-10: sold products behind Categories 10, 11 and 12. */}
                      {(c.n === 10 || c.n === 11 || c.n === 12) && (
                        <Link to="/settings/scope3/sold-products" className={cn(focusRing, "rounded-control text-xs font-medium text-brand hover:underline")}>
                          Sold products
                        </Link>
                      )}
                      {c.n === 10 && <p className="text-xs text-muted">If you can't know what customers make from it, exclude Category 10 and say why.</p>}
                      {/* S3-11: the investments register behind Category 15. */}
                      {c.n === 15 && (
                        <Link to="/settings/scope3/investments" className={cn(focusRing, "rounded-control text-xs font-medium text-brand hover:underline")}>
                          Investments register
                        </Link>
                      )}
                    </div>
                  </div>
                </th>
                <td className="px-3 py-2">
                  {editable && d ? (
                    <Select<BoundaryStatus>
                      label={`Status, ${label}`}
                      hideLabel
                      value={d.status}
                      options={STATUS_OPTIONS}
                      onChange={(v) => v && onChange(c.n, { status: v })}
                    />
                  ) : (
                    <Badge tone={STATUS_TONE[c.status]}>{BOUNDARY_STATUS_LABEL[c.status]}</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  {editable && d ? (
                    <TextField
                      label={`Reason, ${label}`}
                      hideLabel
                      value={d.reason}
                      onChange={(v) => onChange(c.n, { reason: v })}
                      required={needsReason(d.status)}
                      placeholder={needsReason(d.status) ? "Why it's left out" : "Optional"}
                      error={err ?? undefined}
                      maxLength={2000}
                    />
                  ) : (
                    <span className={c.reason ? "text-ink" : "text-muted"}>{c.reason ?? "None"}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {editable && d ? (
                    <TextField
                      label={`Method note, ${label}`}
                      hideLabel
                      value={d.method_note}
                      onChange={(v) => onChange(c.n, { method_note: v })}
                      placeholder="Optional"
                      maxLength={2000}
                    />
                  ) : (
                    <span className={c.method_note ? "text-ink" : "text-muted"}>{c.method_note ?? "None"}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {c.mapped_categories.length ? (
                    <ul className="flex flex-wrap gap-1">
                      {c.mapped_categories.map((m) => (
                        <li key={m.category_id}>
                          <Badge>{m.category_name}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted">None</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted">
                  {/* S3-11 (D10): a default nobody has confirmed yet. */}
                  {isUnconfirmedDefault(c) ? (
                    <div className="space-y-1.5">
                      <div>Default, not confirmed</div>
                      {editable && onConfirmDefault && d && !isRowDirty(d, c) && (
                        <Button size="sm" onClick={() => onConfirmDefault(c.n)} loading={confirming === c.n} aria-label={`Confirm ${label} as not relevant`}>
                          Confirm
                        </Button>
                      )}
                    </div>
                  ) : (
                    lastChanged(c)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

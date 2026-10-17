import { Badge, Button, EMPTY_VALUE, Scope3CategoryChip, Tooltip, cn, focusRing, formatEmissions, formatPercent, panel } from "../../../../ui";
import { BOUNDARY_STATUS_LABEL, type BoundaryStatus } from "../../../../lib/scope3/boundary";
import { DIRECTION_LABEL } from "../../../../lib/scope3/contracts";
import { RELEVANCE_CRITERIA } from "../../../../lib/scope3/screening";
import type { ScreeningCategory } from "../../../../services/scope3ScreeningService";
import { estimateCaption, shareWidth, suggestionApplied } from "../logic";

const STATUS_TONE: Record<BoundaryStatus, "good" | "neutral" | "warn" | "info"> = {
  included: "good",
  excluded: "warn",
  not_relevant: "neutral",
  screening: "info",
};

export type ScreeningTableProps = {
  categories: ScreeningCategory[];
  editable: boolean;
  /** The category whose ticks are being saved. */
  savingN: number | null;
  onTick: (c: ScreeningCategory, key: string, on: boolean) => void;
  onApply: (c: ScreeningCategory) => void;
  onOpen: (c: ScreeningCategory) => void;
};

/** The Table II ticks of one category: keyboard reachable checkboxes, the guidance wording in each tooltip. */
function Ticks({ c, editable, busy, onTick }: { c: ScreeningCategory; editable: boolean; busy: boolean; onTick: ScreeningTableProps["onTick"] }) {
  return (
    <fieldset className="grid grid-cols-2 gap-x-3 gap-y-1" disabled={!editable || busy} aria-busy={busy}>
      <legend className="sr-only">Why Category {c.n} is relevant</legend>
      {RELEVANCE_CRITERIA.map((r) => {
        const id = `tick-${c.n}-${r.key}`;
        return (
          <div key={r.key} className="flex items-center gap-1.5">
            <Tooltip content={r.help}>
              <input
                id={id}
                type="checkbox"
                className={cn("size-4 shrink-0 accent-brand", focusRing)}
                checked={c.relevance?.[r.key] === true}
                onChange={(e) => onTick(c, r.key, e.target.checked)}
              />
            </Tooltip>
            <label htmlFor={id} className={cn("text-xs", editable ? "cursor-pointer text-ink" : "text-muted")}>
              {r.label}
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}

function Share({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-tint" aria-hidden>
        <div className="h-full rounded-full bg-brand" style={{ width: `${shareWidth(pct)}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-ink">{pct > 0 ? formatPercent(pct) : EMPTY_VALUE}</span>
    </div>
  );
}

function Estimate({ c }: { c: ScreeningCategory }) {
  const caption = estimateCaption(c);
  if (c.estimate_tco2e === null)
    return <span className="text-xs text-muted">{c.inputs.length ? "No estimate from these inputs" : "Add a spend figure to estimate this category"}</span>;
  return (
    <div>
      <div className="font-mono tabular-nums text-ink">{formatEmissions(c.estimate_tco2e)}</div>
      {caption && <div className="text-xs text-muted">{caption}</div>}
    </div>
  );
}

function Recorded({ c }: { c: ScreeningCategory }) {
  return (
    <div>
      <div className="font-mono tabular-nums text-ink">{formatEmissions(c.recorded_tco2e)}</div>
      {c.pending_tco2e > 0 && <div className="text-xs text-muted">{formatEmissions(c.pending_tco2e)} pending</div>}
      {c.proxy_tco2e > 0 && <div className="text-xs text-muted">{formatEmissions(c.proxy_tco2e)} extrapolated</div>}
    </div>
  );
}

function Suggestion({ c }: { c: ScreeningCategory }) {
  return (
    <div className="space-y-0.5">
      <Badge tone={STATUS_TONE[c.suggestion.status]}>{BOUNDARY_STATUS_LABEL[c.suggestion.status]}</Badge>
      {c.suggestion.reason && <p className="text-xs text-muted">{c.suggestion.reason}</p>}
    </div>
  );
}

function Actions({ c, editable, onApply, onOpen }: { c: ScreeningCategory } & Pick<ScreeningTableProps, "editable" | "onApply" | "onOpen">) {
  const applied = suggestionApplied(c);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {editable && (
        <Button size="sm" variant={applied ? "ghost" : "secondary"} onClick={() => onApply(c)} aria-label={`Apply the suggestion for Category ${c.n}`}>
          {applied ? "Change" : "Apply"}
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => onOpen(c)} aria-label={`Inputs and extrapolation for Category ${c.n}`}>
        Details
      </Button>
    </div>
  );
}

/**
 * The 15 categories: recorded and estimated size, share, Table II ticks,
 * the suggested and current status and Apply. A table from 768 px, one card
 * per category below.
 */
export function ScreeningTable({ categories, editable, savingN, onTick, onApply, onOpen }: ScreeningTableProps) {
  return (
    <>
      <div className={cn(panel, "relative hidden overflow-x-auto md:block")}>
        <table className="w-full min-w-[1180px] text-left text-sm">
          <caption className="sr-only">Scope 3 categories with their recorded and estimated size and why each is relevant</caption>
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Category</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Recorded</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Estimate</th>
              <th scope="col" className="px-3 py-2 font-medium">Share</th>
              <th scope="col" className="w-64 px-3 py-2 font-medium">Why it's relevant</th>
              <th scope="col" className="w-56 px-3 py-2 font-medium">Suggestion</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {categories.map((c) => (
              <tr key={c.n} data-testid={`screening-row-${c.n}`} className="align-top">
                <th scope="row" className="px-3 py-2.5 font-normal">
                  <div className="flex items-start gap-2">
                    <Scope3CategoryChip n={c.n} compact />
                    <div className="min-w-0">
                      <div className="font-medium text-ink">{c.name}</div>
                      <div className="text-xs text-muted">{DIRECTION_LABEL[c.direction]}</div>
                    </div>
                  </div>
                </th>
                <td className="px-3 py-2.5 text-right"><Recorded c={c} /></td>
                <td className="px-3 py-2.5 text-right"><Estimate c={c} /></td>
                <td className="px-3 py-2.5"><Share pct={c.share_pct} /></td>
                <td className="px-3 py-2.5"><Ticks c={c} editable={editable} busy={savingN === c.n} onTick={onTick} /></td>
                <td className="px-3 py-2.5"><Suggestion c={c} /></td>
                <td className="px-3 py-2.5">
                  <Badge tone={STATUS_TONE[c.status]}>{BOUNDARY_STATUS_LABEL[c.status]}</Badge>
                  {c.reason && c.status !== "included" && <p className="mt-0.5 max-w-48 text-xs text-muted">{c.reason}</p>}
                </td>
                <td className="px-3 py-2.5"><Actions c={c} editable={editable} onApply={onApply} onOpen={onOpen} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label="Scope 3 categories">
        {categories.map((c) => (
          <li key={c.n} className={cn(panel, "space-y-3 p-4")} data-testid={`screening-card-${c.n}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <Scope3CategoryChip n={c.n} compact />
                <div className="min-w-0 font-medium text-ink">{c.name}</div>
              </div>
              <Badge tone={STATUS_TONE[c.status]}>{BOUNDARY_STATUS_LABEL[c.status]}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Recorded</dt>
                <dd><Recorded c={c} /></dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Estimate</dt>
                <dd><Estimate c={c} /></dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted">Share</dt>
                <dd><Share pct={c.share_pct} /></dd>
              </div>
            </dl>
            <Ticks c={c} editable={editable} busy={savingN === c.n} onTick={onTick} />
            <div>
              <div className="mb-1 text-xs text-muted">Suggestion</div>
              <Suggestion c={c} />
            </div>
            <Actions c={c} editable={editable} onApply={onApply} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </>
  );
}

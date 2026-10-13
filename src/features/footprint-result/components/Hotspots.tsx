import { Link } from "react-router-dom";
import { askSupplierLink, cn, focusRing, panel } from "../../../ui";
import { STAGE_LABEL, type Hotspot } from "../logic";

const pct = (v: number) => `${v.toLocaleString("en-GB", { maximumFractionDigits: v < 1 ? 1 : 0 })}%`;

type Props = { items: Hotspot[]; hiddenCount: number; studyId: number; onOpenInputs: () => void };

/** Top inputs by share, each with a lever written by rule. */
export function Hotspots({ items, hiddenCount, studyId, onOpenInputs }: Props) {
  return (
    <section aria-labelledby="hotspots-title" className={`${panel} p-4 sm:p-5`}>
      <h2 id="hotspots-title" className="text-sm font-semibold text-ink">
        Hotspots
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No input carries a visible share yet.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {items.map(({ line, text }) => (
            <li key={line.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-ink">{line.name}</span>
                <span className="font-num tabular-nums text-ink">{pct(line.share_pct ?? 0)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-tint" aria-hidden>
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, line.share_pct ?? 0))}%` }} />
              </div>
              <p className="text-xs text-muted">
                <span className="sr-only">{STAGE_LABEL[line.stage]}. </span>
                {text}
                {line.data_type === "secondary" && !line.supplier_specific && line.pcf_input_id != null && (
                  <>
                    {" "}
                    <Link to={askSupplierLink(studyId, line.pcf_input_id)} className={cn("rounded-chip font-medium text-brand-text underline underline-offset-2", focusRing)}>
                      Ask the supplier
                    </Link>
                  </>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
      {hiddenCount > 0 && (
        <p className="mt-3 text-xs text-muted">
          {hiddenCount} licensed {hiddenCount === 1 ? "input isn't" : "inputs aren't"} ranked because {hiddenCount === 1 ? "its value is" : "their values are"} hidden.
        </p>
      )}
      <button type="button" onClick={onOpenInputs} className={cn("mt-3 rounded-chip text-sm font-medium text-brand-text underline underline-offset-2", focusRing)}>
        See every input
      </button>
    </section>
  );
}

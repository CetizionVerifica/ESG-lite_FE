import { AlertTriangle, ArrowRight, CheckCircle2, MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Menu, Tooltip, cn, focusRing } from "../../../ui";
import { type Match, type MappingRow, coverageLabel, createFactorHref, formatFactor } from "../logic";

export type RowActions = {
  edit: (row: MappingRow) => void;
  remove: (row: MappingRow) => void;
};

/** "→ Diesel" with ✓ matched / ⚠ no factor. */
export function GlobalName({ row }: { row: MappingRow }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted" />
      <span className="truncate text-ink">{row.global_category_name}</span>
      <MatchMark match={row.match} />
      {row.match.state === "missing" && (
        <Link
          to={createFactorHref(row)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn("shrink-0 text-xs font-medium text-brand-text underline-offset-2 hover:underline", focusRing)}
        >
          Create factor
        </Link>
      )}
    </span>
  );
}

export function MatchMark({ match }: { match: Match }) {
  if (match.state === "matched") {
    const partial = coverageLabel(match);
    const scope = match.sites ? (partial ? `Only ${partial} have it.` : "Every site of this client has it.") : "";
    const text = `Factor ${formatFactor(match.factor)}${scope ? `. ${scope}` : ""}`;
    return (
      <Tooltip content={text}>
        <span tabIndex={0} className={cn("inline-flex shrink-0 items-center gap-1 text-xs", partial ? "text-warn" : "text-good", focusRing)} aria-label={`Matched: ${text}`}>
          <CheckCircle2 aria-hidden className="size-3.5" /> Matched{partial && ` · ${partial}`}
        </span>
      </Tooltip>
    );
  }
  if (match.state === "missing") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-chip bg-warn-soft px-1.5 text-xs text-warn">
        <AlertTriangle aria-hidden className="size-3.5" /> No factor
      </span>
    );
  }
  return <span className="shrink-0 text-xs text-muted">Checking…</span>;
}

export function RowMenu({ row, actions }: { row: MappingRow; actions: RowActions }) {
  const label = `Actions for ${row.company_category_name}`;
  return (
    // The row opens the drawer on click and Enter; the menu must not.
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Menu
        label={label}
        items={[
          { label: "Edit", onSelect: () => actions.edit(row) },
          { kind: "separator" },
          { label: "Delete…", danger: true, onSelect: () => actions.remove(row) },
        ]}
        trigger={(t) => (
          <Button {...t} size="sm" variant="ghost" aria-label={label}>
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        )}
      />
    </span>
  );
}

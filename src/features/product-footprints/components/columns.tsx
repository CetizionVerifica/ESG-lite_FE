import { Link } from "react-router-dom";
import { type Column, EMPTY_VALUE, cn, focusRing, formatDate, formatDelta, formatPercent } from "../../../ui";
import { type FootprintRow, STAGES, STAGE_LABEL, STATUS_LABEL } from "../logic";
import { FootprintStatus } from "./FootprintStatus";
import { StageBar } from "./StageBar";

const kg = (v: number | null) => (v === null ? EMPTY_VALUE : v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 3 }));
const deltaTone = { good: "text-good", bad: "text-bad", neutral: "text-muted" } as const;

/** DataTable columns: Product | Declared unit | kgCO₂e per unit | vs previous | Stages | Primary data | Status | Updated. */
export function footprintColumns(opts: { startLink: (r: FootprintRow) => string; showSite: boolean }): Column<FootprintRow>[] {
  return [
    {
      id: "product",
      header: "Product",
      hideable: false,
      sortable: true,
      value: (r) => r.product_name,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-ink">{r.product_name}</span>
          {(opts.showSite || r.pcr_tag) && (
            <span className="block truncate text-xs text-muted">{[opts.showSite ? r.site_name : null, r.pcr_tag].filter(Boolean).join(" · ")}</span>
          )}
        </span>
      ),
    },
    { id: "site", header: "Site", sortable: true, defaultHidden: true, value: (r) => r.site_name },
    { id: "declared", header: "Declared unit", sortable: true, width: "8rem", value: (r) => r.declared_unit ?? EMPTY_VALUE },
    {
      id: "total",
      header: "kgCO₂e per unit",
      numeric: true,
      sortable: true,
      value: (r) => r.total,
      cell: (r) => kg(r.total),
    },
    {
      id: "previous",
      header: "vs previous",
      numeric: true,
      sortable: true,
      width: "7rem",
      value: (r) => formatDelta(r.total, r.previous)?.pct ?? null,
      exportValue: (r) => formatDelta(r.total, r.previous)?.text ?? "",
      cell: (r) => {
        const d = formatDelta(r.total, r.previous);
        return d ? <span className={deltaTone[d.tone]}>{d.text}</span> : <span className="text-muted">{EMPTY_VALUE}</span>;
      },
    },
    {
      id: "stages",
      header: "Stages",
      width: "6rem",
      value: () => null,
      exportValue: (r) =>
        r.stages
          ? STAGES.map((s) => `${STAGE_LABEL[s]} ${r.stages?.[s] === null ? "hidden" : kg(r.stages?.[s] ?? 0)}`).join("; ")
          : "",
      cell: (r) => <StageBar row={r} />,
    },
    {
      id: "primary",
      header: "Primary data",
      numeric: true,
      sortable: true,
      width: "7rem",
      value: (r) => r.primary,
      cell: (r) => (r.primary === null ? <span className="text-muted">{EMPTY_VALUE}</span> : formatPercent(r.primary, 0)),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      width: "10rem",
      value: (r) => STATUS_LABEL[r.status],
      exportValue: (r) => [STATUS_LABEL[r.status], r.in_progress].filter(Boolean).join(" · "),
      cell: (r) =>
        r.status === "none" ? (
          <span className="inline-flex items-center gap-2">
            <FootprintStatus status="none" />
            <Link
              to={opts.startLink(r)}
              onClick={(e) => e.stopPropagation()}
              className={cn("rounded-chip text-sm font-medium text-brand-text underline-offset-2 hover:underline", focusRing)}
            >
              Start<span className="sr-only"> a footprint for {r.product_name}</span>
            </Link>
          </span>
        ) : (
          <span className="inline-flex flex-col items-start gap-0.5">
            <FootprintStatus status={r.status} />
            {r.in_progress && <span className="text-xs text-muted">{r.in_progress}</span>}
          </span>
        ),
    },
    {
      id: "updated",
      header: "Updated",
      sortable: true,
      width: "7rem",
      value: (r) => (r.updated ? formatDate(r.updated) : EMPTY_VALUE),
      sortValue: (r) => r.updated ?? "",
    },
  ];
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button, ChartFrame, Drawer, cn, formatNumber, formatPercent } from "../../../ui";
import { monthLabel } from "../../../lib/insights/labels";
import { Legend, LegendItem } from "../components/kit";
import { usePanelView } from "../components/panelView";
import type { PanelProps } from "./index";
import { COMPLETENESS_COLUMNS, HEAT_CLASS, HEAT_STEPS, type CellRef, cellAt, completenessAria, completenessOption, completenessRows, heatStep } from "./completenessLogic";

/** Below this width the panel opens on its table (12 months of cells don't fit a phone). */
const NARROW = "(max-width: 639px)";
const isNarrow = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(NARROW).matches;

/**
 * IN-4 · G · Completeness (05-ux §4 G): sites × months on the heat ramp, the
 * server's % printed in each cell, future months blank. A cell (or its row's
 * "Details" in the table) opens a drawer with what's expected and approved
 * for that site and month, and a link to the entries.
 */
export function Completeness({ response, query }: PanelProps<"completeness">) {
  const data = response.data;
  const { view, setView } = usePanelView();
  const [open, setOpen] = useState<CellRef | null>(null);

  // Phones start on the table (once, on mount); the Chart / Table switch still works.
  useEffect(() => {
    if (isNarrow()) setView("table");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first render only
  }, []);

  const table = useMemo(
    () => ({
      columns: [...COMPLETENESS_COLUMNS, { id: "details", header: "Details" }],
      rows: completenessRows(data).map(({ cell, ...r }) => ({
        ...r,
        details: (
          <Button size="sm" variant="ghost" onClick={() => setOpen(cell)} aria-label={`Details for ${r.site}, ${r.month}`} data-testid="completeness-row-details">
            Details
          </Button>
        ),
      })),
    }),
    [data],
  );
  const aria = useMemo(() => completenessAria(data), [data]);
  const height = Math.max(160, data.rows.length * 44 + 48);
  const picked = open ? cellAt(data, open) : null;

  return (
    <div data-testid="completeness">
      <ChartFrame
        title="Approved data by site and month"
        unit="% complete"
        subtitle={`${response.label} · blank months aren't due yet`}
        option={(t) => completenessOption(data, t)}
        height={height}
        table={table}
        exportName={`insights-completeness-${response.period?.year ?? query.year}`}
        ariaLabel={aria}
        view={view}
        onViewChange={setView}
        onEvents={{
          click: (p: unknown) => {
            const d = (p as { data?: CellRef }).data;
            if (d && typeof d.row === "number" && typeof d.col === "number") setOpen({ row: d.row, col: d.col });
          },
        }}
        legend={
          <Legend label="Colour scale">
            {HEAT_STEPS.map((s, i) => (
              <LegendItem key={s.label} swatch={<span className={cn("inline-block size-3 rounded-sm", HEAT_CLASS[i])} />}>
                {s.label}
              </LegendItem>
            ))}
            <LegendItem swatch={<span className="inline-block size-3 rounded-sm border border-line bg-panel" />}>Not due yet</LegendItem>
          </Legend>
        }
      />
      <CellDrawer picked={picked} onClose={() => setOpen(null)} />
    </div>
  );
}

function CellDrawer({ picked, onClose }: { picked: ReturnType<typeof cellAt>; onClose: () => void }) {
  if (!picked) return null;
  const { site, cell } = picked;
  const step = heatStep(cell.pct);
  const emissionsMissing = cell.emissions_expected > cell.emissions_approved;
  const kpiMissing = cell.kpi_expected > cell.kpi_approved;
  return (
    <Drawer
      open
      onClose={onClose}
      size="sm"
      title={`${site} · ${monthLabel(cell.month)}`}
      subtitle={cell.pct === null ? "Not due yet" : `${formatPercent(cell.pct, 0)} of the expected data is approved`}
      footer={
        <Link to={cell.link} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline" data-testid="completeness-link">
          Open the entries for this month <ArrowRight aria-hidden className="size-4" />
        </Link>
      }
    >
      <div className="space-y-4" data-testid="completeness-drawer">
        {step !== null && (
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", HEAT_CLASS[step])}>{HEAT_STEPS[step].label}</span>
        )}
        <dl className="divide-y divide-line rounded-control border border-line">
          <Row label="Emission entries" expected={cell.emissions_expected} approved={cell.emissions_approved} missing={emissionsMissing} />
          <Row label="KPI values" expected={cell.kpi_expected} approved={cell.kpi_approved} missing={kpiMissing} none="No KPI values due this month." />
        </dl>
        {!emissionsMissing && !kpiMissing && cell.pct !== null && <p className="text-sm text-muted">Everything expected for this month is approved.</p>}
      </div>
    </Drawer>
  );
}

function Row({ label, expected, approved, missing, none = "Nothing expected this month." }: { label: string; expected: number; approved: number; missing: boolean; none?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 text-sm">
      <dt className="font-medium text-ink">{label}</dt>
      <dd className="text-right text-ink">
        {expected ? (
          <>
            <span className="font-num tabular-nums">
              {formatNumber(approved)} of {formatNumber(expected)}
            </span>{" "}
            approved
            {missing && <span className="block text-xs text-warn">Some are still missing or waiting for approval.</span>}
          </>
        ) : (
          <span className="text-muted">{none}</span>
        )}
      </dd>
    </div>
  );
}

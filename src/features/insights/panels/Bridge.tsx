// IN-5 · D · Emissions bridge (05-ux §4 D): a waterfall from last year's
// total to this year's, one bar per driver, and "How this is calculated".
// It lives in the pathway slot behind the "Pathway | What moved" toggle (the
// lead adds the toggle); `BridgePanel` gives it its own states for that.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, ChartFrame, EmptyState, SkeletonChart, cn, focusRing } from "../../../ui";
import type { InsightsQuery } from "../../../lib/insights/contracts";
import { isInsightsOff } from "../../../lib/insights/switch";
import { CalcDrawer } from "../components/CalcDrawer";
import { Legend, LegendItem } from "../components/kit";
import { usePanelView } from "../components/panelView";
import { useBridge } from "../hooks/useBridge";
import { EMPTY_FALLBACK, shellState } from "../logic";
import { BRIDGE_COLUMNS, bridgeAriaLabel, bridgeOption, bridgeTableRows } from "./bridgeLogic";
import type { PanelProps } from "./index";

const Swatch = ({ className }: { className: string }) => <span className={cn("inline-block size-3 rounded-[2px]", className)} />;

export function Bridge({ response }: PanelProps<"bridge">) {
  const data = response.data;
  const { view, setView } = usePanelView();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0" data-testid="bridge">
      <ChartFrame
        className="border-0! bg-transparent! p-0!"
        title="What moved"
        unit="tCO₂e"
        subtitle={`${data.from.year} to ${data.to.year}`}
        option={(t) => bridgeOption(data, t)}
        height={300}
        table={{ columns: BRIDGE_COLUMNS, rows: bridgeTableRows(data) }}
        exportName={`emissions-bridge-${data.from.year}-${data.to.year}`}
        ariaLabel={bridgeAriaLabel(data)}
        view={view}
        onViewChange={setView}
        actions={
          <button type="button" onClick={() => setOpen(true)} className={cn("rounded-control text-xs font-medium text-brand hover:underline", focusRing)} data-testid="bridge-how">
            How this is calculated
          </button>
        }
        legend={
          <Legend label="Bar colours">
            <LegendItem swatch={<Swatch className="bg-brand" />}>Total</LegendItem>
            <LegendItem swatch={<Swatch className="bg-bad" />}>Increase (+)</LegendItem>
            <LegendItem swatch={<Swatch className="bg-good" />}>Decrease (−)</LegendItem>
          </Legend>
        }
      />
      {data.notes.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted" data-testid="bridge-notes">
          {data.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <CalcDrawer open={open} onClose={() => setOpen(false)} data={data} />
    </div>
  );
}

export interface BridgePanelProps {
  query: InsightsQuery;
  /** False until the toggle shows the bridge (lazy). */
  enabled?: boolean;
  /** A server IN_OFF answer: the page swaps to its "not turned on" state. */
  onSwitchOff?: () => void;
}

/**
 * The bridge with its own states, for mounting inside the pathway slot:
 * loading skeleton, error with Retry, `no_data` / `setup_incomplete` with the
 * server's reason and link, `kpi_off` → nothing (the bridge never is).
 */
export function BridgePanel({ query, enabled = true, onSwitchOff }: BridgePanelProps) {
  const q = useBridge(query, { enabled });
  const state = shellState(q);

  useEffect(() => {
    if (q.error && isInsightsOff(q.error)) onSwitchOff?.();
  }, [q.error, onSwitchOff]);

  const dimmed = q.isPlaceholderData && q.isFetching;
  let body;
  if (state === "hidden") return null;
  if (state === "loading") body = <SkeletonChart />;
  else if (state === "error")
    body = (
      <EmptyState
        compact
        variant="error"
        title="Couldn't load what moved emissions."
        action={
          <Button size="sm" onClick={() => void q.refetch()} loading={q.isFetching}>
            Retry
          </Button>
        }
      />
    );
  else if (state === "empty") {
    const r = q.data!;
    const reason = r.reason ?? EMPTY_FALLBACK[r.availability as "no_data" | "setup_incomplete"];
    const setup = r.links.setup ?? r.links.empty;
    body = (
      <EmptyState
        compact
        title={reason}
        action={
          setup ? (
            <Link to={setup} className="text-sm font-medium text-brand hover:underline">
              Open setup
            </Link>
          ) : undefined
        }
      />
    );
  } else body = <Bridge response={{ ...q.data!, data: q.data!.data! }} query={query} />;

  return (
    <div data-testid="bridge-panel" data-state={state} aria-busy={state === "loading" || dimmed} className={cn("min-w-0 transition-opacity", dimmed && "opacity-60")}>
      {body}
    </div>
  );
}

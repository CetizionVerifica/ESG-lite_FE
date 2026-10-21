import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Hammer } from "lucide-react";
import { Button, EmptyState, SkeletonChart, cn, focusRing, panel as panelBox } from "../../../ui";
import type { InsightsQuery, PanelId } from "../../../lib/insights/contracts";
import { isInsightsOff } from "../../../lib/insights/switch";
import { panelFade, pulse } from "../../../lib/insights/motion";
import { usePanel } from "../api";
import { EMPTY_FALLBACK, type SlotDef, shellState } from "../logic";
import { PANELS } from "../panels";
import { PanelViewContext, type PanelView } from "./panelView";

export interface PanelShellProps {
  slot: SlotDef;
  query: InsightsQuery;
  /** `?panel=` named this slot: scroll to it and pulse its outline. */
  target?: boolean;
  /** A lazy tab passes false until it's opened. */
  enabled?: boolean;
  /** Overrides the registry (tests, present mode). */
  children?: (props: { panel: PanelId }) => ReactNode;
  /** A server IN_OFF answer: the page swaps to its "not turned on" state. */
  onSwitchOff?: () => void;
  className?: string;
}

/**
 * IN-0 · One shell per panel (layer rule 2): loading skeleton, error with
 * Retry, `kpi_off` → nothing, `no_data` / `setup_incomplete` → EmptyState
 * with the server's reason and its link, and the `?panel=` pulse. Each panel
 * loads, fails and retries on its own. While the next query loads, the old
 * content stays, dimmed.
 */
export function PanelShell({ slot, query, target = false, enabled = true, children, onSwitchOff, className }: PanelShellProps) {
  const q = usePanel(slot.panel, query, { enabled });
  const ref = useRef<HTMLElement>(null);
  const state = shellState(q);
  const [view, setView] = useState<PanelView>("chart");
  const viewState = useMemo(() => ({ view, setView }), [view]);

  useEffect(() => {
    if (q.error && isInsightsOff(q.error)) onSwitchOff?.();
  }, [q.error, onSwitchOff]);

  useEffect(() => {
    if (target && state !== "loading") ref.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
  }, [target, state]);

  if (state === "hidden") return null;

  const Component = PANELS[slot.id];
  const titleId = `insights-${slot.id}-title`;
  let body: ReactNode;
  if (state === "loading") {
    body = <SkeletonChart />;
  } else if (state === "error") {
    body = (
      <EmptyState
        compact
        variant="error"
        title={`Couldn't load ${slot.title.toLowerCase()}.`}
        action={
          <Button size="sm" onClick={() => void q.refetch()} loading={q.isFetching}>
            Retry
          </Button>
        }
      />
    );
  } else if (state === "empty") {
    const r = q.data!;
    const reason = r.reason ?? EMPTY_FALLBACK[r.availability as "no_data" | "setup_incomplete"];
    const setup = r.links.setup ?? r.links.empty;
    body = <EmptyState compact title={reason} action={setup ? <Link to={setup} className="text-sm font-medium text-brand hover:underline">Open setup</Link> : undefined} />;
  } else if (children) {
    body = children({ panel: slot.panel });
  } else if (Component && q.data?.data) {
    body = <Component response={{ ...q.data, data: q.data.data }} query={query} />;
  } else {
    body = (
      <EmptyState
        compact
        icon={Hammer}
        title={`${slot.title} is on its way.`}
        description={<span data-testid="panel-placeholder">{q.data?.label}. This panel is built in {slot.module}.</span>}
      />
    );
  }

  const dimmed = q.isPlaceholderData && q.isFetching;
  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      aria-busy={state === "loading" || dimmed}
      data-testid={`panel-${slot.id}`}
      data-state={state}
      data-panel={slot.panel}
      style={panelFade()}
      className={cn(panelBox, "min-w-0 scroll-mt-20 p-4 transition-opacity", dimmed && "opacity-60", pulse(target), className)}
    >
      <h2 id={titleId} className="mb-3 text-sm font-semibold text-ink">
        {state === "ok" && slot.area !== "band" ? (
          // Enter (or a click) on the header flips between the chart and its table (05-ux §5).
          <button
            type="button"
            className={cn("rounded-control text-left", focusRing)}
            aria-pressed={view === "table"}
            title={view === "table" ? "Show the chart" : "Show as a table"}
            onClick={() => setView(view === "table" ? "chart" : "table")}
            data-testid="panel-header"
          >
            {slot.title}
            <span className="sr-only">{view === "table" ? ", showing the table. Press to show the chart." : ". Press to show as a table."}</span>
          </button>
        ) : (
          slot.title
        )}
      </h2>
      <PanelViewContext.Provider value={viewState}>{body}</PanelViewContext.Provider>
    </section>
  );
}

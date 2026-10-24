import { TrendingUp } from "lucide-react";
import type { KpiEsgMover } from "../../../../lib/kpi/contracts";
import { EmptyState, cn, panel } from "../../../../ui";
import { PillarBadge } from "../../components/PillarBadge";
import { moverWords } from "../logic";
import { ChangeChip } from "./ChangeChip";

/** Wave E · The five biggest changes on last year, each with its pillar badge and Better / Worse. */
export function Movers({ movers, vsLabel }: { movers: KpiEsgMover[]; vsLabel: string }) {
  return (
    <section aria-labelledby="esg-movers-title" className={cn(panel, "p-4")}>
      <h2 id="esg-movers-title" className="mb-1 text-sm font-semibold text-ink">
        Biggest changes on {vsLabel}
      </h2>
      {movers.length === 0 ? (
        <EmptyState compact icon={TrendingUp} title={`Nothing to compare with ${vsLabel} yet.`} description="Changes show once a KPI has approved values in both years." />
      ) : (
        <ol className="divide-y divide-line" data-testid="esg-movers">
          {movers.map((m) => {
            const words = moverWords(m, vsLabel);
            return (
              <li key={`${m.kpi_definition_id}-${m.name}`} className="flex items-center gap-2 py-2" data-testid="esg-mover">
                <PillarBadge pillar={m.pillar} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{m.name}</span>
                {words && <ChangeChip change={words} />}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

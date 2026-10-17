import { useState } from "react";
import { Calculator, Check, Plus } from "lucide-react";
import type { FrameworkUse } from "../../../../lib/kpi/badges";
import { KPI_FREQUENCIES, type KpiDefinition, type KpiFrequency } from "../../../../lib/kpi/contracts";
import { FREQUENCY_LABEL, LEVEL_LABEL, TOPIC_LABEL } from "../../../../lib/kpi/labels";
import type { Recommendation } from "../../../../lib/kpi/recommend";
import { Badge, Button, Popover, TextField, cn, focusRing, panel } from "../../../../ui";
import { FrameworkBadges } from "../../components/FrameworkBadges";
import { type KpiChoice, countSelected, groupByTopic, whyRequired } from "../logic";

type Props = {
  defs: KpiDefinition[];
  choices: Map<number, KpiChoice>;
  onChoice: (id: number, choice: KpiChoice) => void;
  rec: Recommendation;
  uses: Map<number, FrameworkUse[]>;
  /** "GRI · BRSR 2023 · ESRS 2023 · climate, water are material" */
  context: string;
  onAddOwn: () => void;
  missing: number[] | null;
};

function Box({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border", on ? "border-brand bg-brand text-on-brand" : "border-line bg-panel")}>
      {on && <Check className="size-3.5" />}
    </span>
  );
}

/** Leaving out a required KPI asks for a one-line reason first (it goes into the reports). */
function ReasonPrompt({ def, why, onLeaveOut }: { def: KpiDefinition; why: string; onLeaveOut: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Popover
      label={`Leave out ${def.name}?`}
      trigger={(t) => (
        <button {...t} type="button" role="checkbox" aria-checked aria-label={def.name} className={cn("rounded-control", focusRing)}>
          <Box on />
        </button>
      )}
    >
      {(close) => (
        <form
          className="w-72 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            onLeaveOut(reason.trim());
            close();
          }}
        >
          <p className="text-sm font-medium text-ink">Leave out {def.name}?</p>
          <p className="text-xs text-muted">{why} Say why in one line; it's shown in your reports.</p>
          <TextField label="Reason" value={reason} onChange={setReason} placeholder="For example: zero liquid discharge plant" required />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={close}>
              Keep it
            </Button>
            <Button size="sm" type="submit" disabled={!reason.trim()}>
              Leave it out
            </Button>
          </div>
        </form>
      )}
    </Popover>
  );
}

/**
 * KPI-3 step 3 (05-ux S2): the KPIs grouped by topic, pre-ticked with what
 * the frameworks require, with badges, Auto / Calculated chips, level and
 * frequency, and a live count.
 */
export function KpisStep({ defs, choices, onChoice, rec, uses, context, onAddOwn, missing }: Props) {
  const counts = countSelected(defs, choices);
  const groups = groupByTopic(defs);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink" aria-live="polite" data-testid="kpi-count">
        <span>
          <b className="font-num">{counts.total}</b> KPIs selected
        </span>
        <span>
          <b className="font-num">{counts.auto}</b> filled from your data
        </span>
        <span>
          <b className="font-num">{counts.formula}</b> calculated
        </span>
        <span>
          <b className="font-num">{counts.manual}</b> to enter
        </span>
        {context && <span className="text-muted">{context}</span>}
      </div>

      <div className={cn(panel, "divide-y divide-line")}>
        {groups.map((g) => (
          <section key={g.topic} aria-labelledby={`kpi-topic-${g.topic}`} className="py-2">
            <h3 id={`kpi-topic-${g.topic}`} className="px-4 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {TOPIC_LABEL[g.topic]}
            </h3>
            <ul>
              {g.defs.map((d) => {
                const c = choices.get(d.id) ?? { selected: false, reason: "", frequency: null };
                const required = rec.ids.has(d.id);
                const flagged = missing?.includes(d.id);
                const freq = c.frequency ?? d.default_frequency;
                return (
                  <li key={d.id} className={cn("flex flex-wrap items-start gap-3 px-4 py-2.5", flagged && "bg-bad-soft/40")} data-testid="setup-kpi-row">
                    {c.selected && required ? (
                      <ReasonPrompt def={d} why={whyRequired(d.id, rec)} onLeaveOut={(reason) => onChoice(d.id, { ...c, selected: false, reason })} />
                    ) : (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={c.selected}
                        aria-label={d.name}
                        onClick={() => onChoice(d.id, { ...c, selected: !c.selected })}
                        className={cn("rounded-control", focusRing)}
                      >
                        <Box on={c.selected} />
                      </button>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <b className="font-medium text-ink">{d.name}</b>
                        {d.company_id !== null && <Badge tone="brand">Your own</Badge>}
                        {required && !c.selected && <Badge tone="warn">Required</Badge>}
                      </p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span>{LEVEL_LABEL[d.level]}</span>
                        <span aria-hidden>·</span>
                        {d.source === "formula" ? (
                          <span>{FREQUENCY_LABEL[freq].toLowerCase()}</span>
                        ) : (
                          <label className="inline-flex items-center gap-1">
                            <span className="sr-only">How often for {d.name}</span>
                            <select
                              value={freq}
                              disabled={!c.selected}
                              onChange={(e) => onChoice(d.id, { ...c, frequency: e.target.value === d.default_frequency ? null : (e.target.value as KpiFrequency) })}
                              className={cn("rounded-chip border border-line bg-panel px-1 py-0.5 text-xs text-ink disabled:opacity-60", focusRing)}
                            >
                              {KPI_FREQUENCIES.map((f) => (
                                <option key={f} value={f}>
                                  {FREQUENCY_LABEL[f].toLowerCase()}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <span aria-hidden>·</span>
                        {d.source === "auto" ? (
                          <Badge tone="info">Auto</Badge>
                        ) : d.source === "formula" ? (
                          <Badge tone="info">
                            <Calculator aria-hidden className="mr-1 size-3" />
                            Calculated
                          </Badge>
                        ) : (
                          <span>entered</span>
                        )}
                      </p>
                      {required && !c.selected && (
                        <p className="text-xs text-ink">
                          {whyRequired(d.id, rec)} Reason for leaving it out: {c.reason ? <q>{c.reason}</q> : <span className="text-bad">add a reason (tick it to keep it)</span>}
                        </p>
                      )}
                    </div>
                    <FrameworkBadges items={uses.get(d.id) ?? []} tips className="sm:justify-end" />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <Button variant="secondary" onClick={onAddOwn}>
        <Plus aria-hidden className="size-4" />
        Add your own KPI
      </Button>
    </div>
  );
}

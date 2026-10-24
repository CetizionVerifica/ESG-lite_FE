import { ESRS_TOPICS, type EsrsTopic } from "../../../../lib/kpi/contracts";
import { esrsTopicLabel } from "../../../../lib/kpi/labels";
import { SegmentedControl, TextField, cn, panel } from "../../../../ui";
import type { MaterialChoice, MaterialState } from "../logic";

type Answer = "yes" | "no" | "";

/**
 * KPI-3 step 2 (only with CSRD/ESRS, D13): which ESRS topics matter to the
 * company. "No" asks for one line of reason, since ESRS requires it.
 * Climate starts at Yes.
 */
export function MaterialityStep({ value, onChange, errors }: { value: MaterialState; onChange: (v: MaterialState) => void; errors: Partial<Record<EsrsTopic, string>> | null }) {
  const set = (t: EsrsTopic, patch: Partial<MaterialChoice>) => onChange({ ...value, [t]: { ...value[t], ...patch } });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Say whether each topic matters to your business. KPIs for topics that don't matter are left out of your ESRS report; the reason you give goes into it.
      </p>
      <ul className={cn(panel, "divide-y divide-line")}>
        {ESRS_TOPICS.map((t) => {
          const v = value[t];
          const answer: Answer = v.material === null ? "" : v.material ? "yes" : "no";
          const err = errors?.[t];
          return (
            <li key={t} className="space-y-2 px-4 py-3" data-testid={`topic-${t}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{esrsTopicLabel(t)}</p>
                  {t === "E1" && <p className="text-xs text-muted">Almost every company's emissions make climate material. Change it only if you're sure.</p>}
                </div>
                <SegmentedControl<Answer>
                  label={`Does ${esrsTopicLabel(t)} matter to you?`}
                  size="sm"
                  value={answer}
                  onChange={(a) => set(t, { material: a === "yes" })}
                  options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ]}
                />
              </div>
              {v.material === false && (
                <TextField
                  label="Why doesn't it matter?"
                  value={v.reason}
                  onChange={(reason) => set(t, { reason })}
                  placeholder="For example: no site is near a protected area"
                  error={err && v.material === false ? err : undefined}
                  required
                />
              )}
              {err && v.material === null && (
                <p role="alert" className="text-sm text-bad">
                  {err}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

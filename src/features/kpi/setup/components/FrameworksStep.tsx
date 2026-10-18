import { Check } from "lucide-react";
import { FRAMEWORK_CODES, type KpiFramework, type YearType } from "../../../../lib/kpi/contracts";
import { FRAMEWORK_DESCRIPTION, FRAMEWORK_SETUP_LABEL, YEAR_TYPE_LABEL } from "../../../../lib/kpi/labels";
import { Badge, NumberField, SegmentedControl, Select, cn, focusRing, panel } from "../../../../ui";
import { toggleFramework, versionsByCode } from "../logic";

export type YearSettings = { yearType: YearType; firstYear: number; dueDay: number };

/** Who each framework is for, in one line (05-ux S2 step 1). */
const WHO_FOR: Record<string, string> = {
  GRI: "For any company reporting to investors, customers or the public worldwide.",
  BRSR: "For companies listed in India (SEBI). Includes BRSR Core, where attaching evidence is recommended.",
  ESRS: "For companies under the EU's CSRD. Asks which topics matter to you first.",
};

/**
 * KPI-3 step 1: which frameworks the company reports, the version of each,
 * and its reporting year. One card per framework.
 */
export function FrameworksStep({
  frameworks,
  ids,
  onIds,
  year,
  onYear,
  error,
}: {
  frameworks: KpiFramework[];
  ids: number[];
  onIds: (ids: number[]) => void;
  year: YearSettings;
  onYear: (y: YearSettings) => void;
  error?: string | null;
}) {
  const versions = versionsByCode(frameworks);
  const thisYear = new Date().getFullYear();
  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-medium text-ink">Which frameworks do you report?</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {FRAMEWORK_CODES.filter((code) => versions[code].length).map((code) => {
            const list = versions[code];
            const chosen = list.find((f) => ids.includes(f.id)) ?? null;
            const on = !!chosen;
            return (
              <div key={code} className={cn(panel, "flex flex-col gap-3 p-4", on && "border-brand ring-1 ring-brand")}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => onIds(toggleFramework(ids, code, !on, frameworks))}
                  className={cn("flex items-start gap-3 rounded-control text-left", focusRing)}
                >
                  <span aria-hidden className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border", on ? "border-brand bg-brand text-on-brand" : "border-line bg-panel")}>
                    {on && <Check className="size-3.5" />}
                  </span>
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{FRAMEWORK_SETUP_LABEL[code]}</span>
                      {list.some((f) => f.default_for_new) && <Badge tone="brand">Recommended for you</Badge>}
                    </span>
                    <span className="block text-sm text-muted">{WHO_FOR[code] ?? FRAMEWORK_DESCRIPTION[code]}</span>
                  </span>
                </button>
                {list.length > 1 ? (
                  <Select<number>
                    label={`${FRAMEWORK_SETUP_LABEL[code]} version`}
                    value={chosen?.id ?? list[0].id}
                    disabled={!on}
                    onChange={(v) => v && onIds(toggleFramework(ids, code, true, frameworks, v))}
                    options={list.map((f) => ({ value: f.id, label: f.version }))}
                  />
                ) : (
                  <p className="text-xs text-muted">Version: {list[0].version}</p>
                )}
              </div>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">Reporting year</p>
          <SegmentedControl<YearType>
            label="Reporting year"
            value={year.yearType}
            onChange={(yearType) => onYear({ ...year, yearType })}
            options={[
              { value: "CY", label: YEAR_TYPE_LABEL.CY },
              { value: "FY", label: YEAR_TYPE_LABEL.FY },
            ]}
          />
        </div>
        <Select<number>
          label="First year to track"
          value={year.firstYear}
          onChange={(v) => v && onYear({ ...year, firstYear: v })}
          options={[thisYear - 2, thisYear - 1, thisYear, thisYear + 1].map((y) => ({ value: y, label: String(y) }))}
        />
        <NumberField
          label="Values are due on day"
          help="Of the month after each period ends."
          value={year.dueDay}
          min={1}
          max={28}
          step={1}
          onChange={(v) => onYear({ ...year, dueDay: Math.min(28, Math.max(1, Math.round(v ?? 15))) })}
        />
      </div>
    </div>
  );
}

import type { FrameworkCode, KpiCoverage } from "../../../../lib/kpi/contracts";
import { FRAMEWORK_COLOR, FRAMEWORK_LABEL } from "../../../../lib/kpi/labels";
import { Tooltip, cn, focusRing, formatNumber, panel } from "../../../../ui";
import { ringDash, ringDetail, ringSubtitle } from "../logic";

const R = 26;

/**
 * KPI-10 · One ring per framework the company reports ("GRI · 82 % · 6
 * gaps"), in the framework's colour. A ring is a toggle: it filters the gaps
 * list to that framework. Hover or focus explains the count.
 */
export function CoverageRings({ coverage, active, onToggle }: { coverage: KpiCoverage[]; active: FrameworkCode | null; onToggle: (f: FrameworkCode) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Readiness by framework">
      {coverage.map((c) => {
        const { dash, circumference } = ringDash(c.percent, R);
        const pressed = active === c.framework;
        return (
          <Tooltip key={c.framework} content={<span className="block max-w-xs">{ringDetail(c)} Click to see only its gaps.</span>}>
            <button
              type="button"
              aria-pressed={pressed}
              aria-label={`${ringDetail(c)} ${ringSubtitle(c)}.`}
              onClick={() => onToggle(c.framework)}
              data-testid="kpi-ring"
              className={cn(panel, "flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-tint", pressed && "border-brand bg-tint", focusRing)}
            >
              <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className="shrink-0">
                <circle cx="32" cy="32" r={R} fill="none" className="stroke-line" strokeWidth="7" />
                <circle
                  cx="32"
                  cy="32"
                  r={R}
                  fill="none"
                  className={FRAMEWORK_COLOR[c.framework].stroke}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circumference}`}
                  transform="rotate(-90 32 32)"
                />
                <text x="32" y="36.5" textAnchor="middle" className="fill-ink font-num text-[13px] font-semibold">
                  {formatNumber(c.percent)}%
                </text>
              </svg>
              <span className="min-w-0">
                <b className="flex items-center gap-1.5 text-sm text-ink">
                  <span aria-hidden className={cn("size-2 rounded-full", FRAMEWORK_COLOR[c.framework].bg)} />
                  {FRAMEWORK_LABEL[c.framework]}
                </b>
                <small className="block text-xs text-muted">{ringSubtitle(c)}</small>
              </span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

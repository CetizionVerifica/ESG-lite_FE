import { formatNumber } from "../../../../ui";
import type { SurveyPreview } from "../logic";
import { modeSlug, scaleText } from "../logic";

const km = (n: number) => `${formatNumber(n, n % 1 ? 2 : 0)} km`;

/** The survey by mode, before the plan: respondents and the year's km, and how the server will scale it. */
export function ModePreview({ preview, totalEmployees }: { preview: SurveyPreview; totalEmployees: number | null }) {
  const scale = scaleText(preview.respondents, totalEmployees);
  return (
    <section aria-label="Survey by mode" className="space-y-2" data-testid="mode-preview">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">By mode</h2>
        <p className="text-sm text-muted">
          {preview.respondents} {preview.respondents === 1 ? "person" : "people"} in the survey{scale ? `, ${scale}` : ""}
        </p>
      </div>
      {/* A table from 640 px; stacked cards below. */}
      <ul className="divide-y divide-line rounded-control border border-line">
        <li aria-hidden className="hidden px-3 py-2 text-xs font-medium text-muted sm:grid sm:grid-cols-[1fr_8rem_10rem] sm:gap-3">
          <span>Mode</span>
          <span className="text-right">Respondents</span>
          <span className="text-right">Total km (sample)</span>
        </li>
        {preview.modes.map((m) => (
          <li key={m.key} className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-sm sm:grid-cols-[1fr_8rem_10rem]">
            <span className="col-span-2 font-medium text-ink sm:col-span-1">
              {m.mode}
              {!m.matched && <span className="ml-2 text-xs font-normal text-muted">(not on the form; fix it in the plan)</span>}
            </span>
            <span className="text-muted sm:text-right sm:text-ink">
              <span className="sm:hidden">Respondents </span>
              {m.respondents}
            </span>
            <span className="text-right font-num tabular-nums text-ink" data-testid={`km-${modeSlug(m.mode)}`}>
              {km(m.total_km)}
            </span>
          </li>
        ))}
        {preview.skipped.map((m) => (
          <li key={`skip-${m.mode}`} className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-sm text-muted sm:grid-cols-[1fr_8rem_10rem]" data-testid={`skip-${modeSlug(m.mode)}`}>
            <span className="col-span-2 sm:col-span-1">{m.mode}</span>
            <span className="sm:text-right">
              <span className="sm:hidden">Respondents </span>
              {m.respondents}
            </span>
            <span className="text-right">{m.reason === "zero_emission" ? "No row (no emissions)" : "No row (no distance)"}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Walking and cycling have no emissions and get no row. ESGLite matches each mode to the site's commuting form when you create the plan.</p>
    </section>
  );
}

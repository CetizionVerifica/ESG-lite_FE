import { useState } from "react";
import { CheckCircle2, ChevronDown, Lock, XCircle } from "lucide-react";
import { Badge, Callout, cn, focusRing } from "../../../ui";
import { RAMP_STEPS, STATUS, type Look, type ThemeTokens } from "../../../theme";
import { type GateResult, LOOK_LABELS, clashMessage } from "../logic";

/** Live contrast gate summary, generated ramps and the fixed status colours. */
export function ContrastReport({ gate, tokens, look }: { gate: GateResult; tokens: ThemeTokens; look: Look }) {
  const [open, setOpen] = useState(false);
  const passing = gate.pairs.filter((p) => p.ratio >= p.min).length;
  const adjusted = gate.adjustments.filter((a) => a.look === look);
  const clash = clashMessage(gate.clashes);

  return (
    <section aria-labelledby="contrast-heading" className="space-y-4 rounded-card border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="contrast-heading" className="text-sm font-semibold text-ink">
          Contrast report · {LOOK_LABELS[look]}
        </h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn("inline-flex items-center gap-1 rounded-chip text-xs text-muted hover:text-ink", focusRing)}
        >
          {open ? "Hide pairs" : "Show pairs"}
          <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink" data-testid="contrast-summary">
        <CheckCircle2 aria-hidden className="size-4 text-good" />
        {passing} of {gate.pairs.length} pairs pass AA
        {adjusted.length > 0 && <Badge tone="info">{adjusted.length} adjusted</Badge>}
        {gate.failing.length > 0 && <Badge tone="bad">{gate.failing.length} can't be fixed</Badge>}
      </p>
      {adjusted.length > 0 && (
        <ul className="space-y-1 text-xs text-muted">
          {adjusted.map((a) => (
            <li key={a.text} className="flex items-center gap-2">
              {a.colour && <span aria-hidden className="size-3 shrink-0 rounded-chip border border-line" style={{ background: a.colour }} />}
              {a.text}
              {a.colour && <span className="font-num uppercase">{a.colour}</span>}
            </li>
          ))}
        </ul>
      )}
      {gate.failing.length > 0 && (
        <Callout tone="warn" title="Save is blocked">
          {gate.failing.map((f) => `${f.fg} on ${f.bg} (${LOOK_LABELS[f.look]}) is ${f.ratio.toFixed(2)}:1`).join("; ")}. Pick a different colour.
        </Callout>
      )}
      {gate.fillOnlyAccent && (
        <Callout tone="info" title="Accent is used for fills only">
          It is too light to read as text on white, so links and brand text use the darker brand text colour instead.
        </Callout>
      )}
      {clash && <Callout tone="info">{clash}</Callout>}
      {open && (
        <table className="w-full text-xs">
          <caption className="sr-only">Contrast of every checked pair</caption>
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="py-1 font-medium">Text or graphic</th>
              <th scope="col" className="py-1 font-medium">On</th>
              <th scope="col" className="py-1 text-right font-medium">Ratio</th>
            </tr>
          </thead>
          <tbody>
            {gate.pairs.map((p) => {
              const ok = p.ratio >= p.min;
              return (
                <tr key={`${p.fg}-${p.bg}`} className="border-t border-line text-ink">
                  <td className="py-1">{p.fg}</td>
                  <td className="py-1">{p.bg}</td>
                  <td className="py-1 text-right font-num">
                    <span className={cn("inline-flex items-center gap-1", ok ? "text-good" : "text-bad")}>
                      {ok ? <CheckCircle2 aria-hidden className="size-3" /> : <XCircle aria-hidden className="size-3" />}
                      {p.ratio.toFixed(2)} / {p.min}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted">Generated ramps</h3>
        <Ramp label="Brand" tokens={tokens} name="brand" />
        <Ramp label="Accent" tokens={tokens} name="accent" />
      </div>

      <div className="space-y-2">
        <h3 className="flex items-center gap-1 text-xs font-semibold text-muted">
          <Lock aria-hidden className="size-3" /> Fixed colours · not editable
        </h3>
        <ul className="flex flex-wrap gap-3 opacity-70" aria-label="Status colours">
          {(["good", "warn", "bad", "info"] as const).map((s) => (
            <li key={s} className="flex items-center gap-1.5 text-xs text-muted">
              <span aria-hidden className="size-4 rounded-chip border border-line" style={{ background: STATUS.light[s] }} />
              <span aria-hidden className="size-4 rounded-chip border border-line" style={{ background: STATUS.dark[s] }} />
              {STATUS_NAMES[s]}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const STATUS_NAMES = { good: "Approved", warn: "Pending", bad: "Rejected", info: "Info" } as const;

function Ramp({ label, tokens, name }: { label: string; tokens: ThemeTokens; name: "brand" | "accent" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-muted">{label}</span>
      <ul className="flex flex-1 overflow-hidden rounded-chip border border-line" aria-label={`${label} ramp`}>
        {RAMP_STEPS.map((step) => {
          const value = tokens[`${name}-${step}`];
          return (
            <li key={step} className="flex-1">
              <span
                role="img"
                aria-label={`${label} ${step}: ${value}`}
                title={`${name}-${step} ${value.toUpperCase()}`}
                className="block h-6 w-full"
                style={{ background: value }}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

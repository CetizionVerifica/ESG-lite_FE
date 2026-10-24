// IN-5 · "How this is calculated" (05-ux §4 D): the bridge's method in plain
// words, each driver's inputs as the server sent them, and the server's notes.
import { Drawer } from "../../../ui";
import type { Bridge } from "../../../lib/insights/contracts";
import { driverLabel, inputRows, signed } from "../panels/bridgeLogic";

export interface CalcDrawerProps {
  open: boolean;
  onClose: () => void;
  data: Bridge;
}

export function CalcDrawer({ open, onClose, data }: CalcDrawerProps) {
  const years = { from: data.from.year, to: data.to.year };
  return (
    <Drawer open={open} onClose={onClose} title="How this is calculated" subtitle={`What moved emissions from ${data.from.year} to ${data.to.year}`} size="sm">
      <div className="space-y-5 text-sm text-ink" data-testid="calc-drawer">
        <section className="space-y-2">
          <h3 className="font-semibold">The method</h3>
          <p>
            We split the change in emissions between {data.from.year} and {data.to.year} into drivers with the additive log-mean Divisia method (LMDI). Scope 1 is output × emissions per unit of output. Scope 2 is output × electricity per unit
            of output × emissions per kWh. Scope 3 is treated as one block.
          </p>
          <p>
            Each driver&apos;s effect = L(Eᵀ, E⁰) × ln(driverᵀ / driver⁰), where L is the log-mean of the two years&apos; emissions and ln is the natural log of how much the driver changed. The effects add up exactly to the change, with nothing left
            over.
          </p>
        </section>

        {data.steps.map((s) => {
          const rows = inputRows(s, years);
          return (
            <section key={s.driver} className="space-y-1.5" data-testid={`calc-step-${s.driver}`}>
              <h3 className="flex flex-wrap items-baseline justify-between gap-x-2 font-semibold">
                <span>{driverLabel(s)}</span>
                <span className="font-num text-xs font-medium tabular-nums text-muted">{signed(s.value)} tCO₂e</span>
              </h3>
              {rows.length > 0 ? (
                <table className="w-full text-xs">
                  <caption className="sr-only">Inputs for {driverLabel(s)}</caption>
                  <thead>
                    <tr className="text-muted">
                      <th scope="col" className="py-1 text-left font-medium">
                        Input
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-t border-line">
                        <td className="py-1 pr-2">{r.name}</td>
                        <td className="py-1 text-right font-num tabular-nums">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-muted">No inputs for this driver.</p>
              )}
            </section>
          );
        })}

        {data.notes.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="font-semibold">Notes</h3>
            <ul className="list-disc space-y-1 pl-5 text-muted" data-testid="calc-notes">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Drawer>
  );
}

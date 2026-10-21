import { useState } from "react";
import { cn } from "../../../ui";
import type { PanelProps } from "../panels";
import { showStripes, stripeCells, stripesSentence } from "./stripesLogic";

const HEAT_BG = ["bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4", "bg-heat-5"] as const;

/**
 * IN-8 · Emission stripes (05-ux §4): one `<div>` per month coloured on the heat
 * ramp between the server's min and max; no numbers and no axes. Hover (or
 * focus on the band and use the arrow keys) reads a month's value. Hidden with
 * fewer than 12 months.
 */
export function StripesBand({ response, height = 48 }: PanelProps<"stripes"> & { height?: number }) {
  const s = response.data;
  const cells = stripeCells(s);
  const [active, setActive] = useState<number | null>(null);
  if (!showStripes(s))
    return (
      <p className="text-xs text-muted" data-testid="stripes-short">
        The monthly stripes appear once there are 12 months of approved emissions.
      </p>
    );
  const readout = active !== null ? cells[active] : null;
  const move = (d: number) => setActive((a) => Math.max(0, Math.min(cells.length - 1, (a ?? (d > 0 ? -1 : cells.length)) + d)));
  return (
    <div data-testid="stripes">
      <div
        role="img"
        aria-label={stripesSentence(s)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") move(1);
          else if (e.key === "ArrowLeft") move(-1);
          else return;
          e.preventDefault();
        }}
        onBlur={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
        className="flex w-full overflow-hidden rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        style={{ height }}
      >
        {cells.map((c, i) => (
          <div
            key={c.month}
            data-month={c.month}
            data-step={c.step ?? "none"}
            title={c.text}
            onMouseEnter={() => setActive(i)}
            className={cn("h-full min-w-0 flex-1", c.step === null ? "bg-tint" : HEAT_BG[c.step], active === i && "outline outline-2 -outline-offset-2 outline-ink")}
          />
        ))}
      </div>
      <p className="mt-1 h-4 text-xs text-muted" aria-live="polite" data-testid="stripes-readout">
        {readout ? readout.text : `${cells[0].label} – ${cells[cells.length - 1].label} · darker is higher`}
      </p>
    </div>
  );
}

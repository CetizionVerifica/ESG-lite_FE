// IN-2 · Small helpers the story panels share: HTML escaping for ECharts
// tooltips, a status → chart colour lookup and percent text. Display only;
// no figure is computed here.
import type { TargetStatus } from "../../../lib/insights/contracts";
import { STATUS_TONE, pctNumber } from "../../../lib/insights/labels";
import type { ChartTheme } from "../../../theme";

/** Escapes server text before it goes into an HTML tooltip. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The chart colour of a target status (its tone): good / warn / bad, muted for no data. */
export function statusColor(status: TargetStatus, t: Pick<ChartTheme, "status" | "ui">): string {
  const tone = STATUS_TONE[status];
  return tone === "neutral" ? t.ui.muted : t.status[tone];
}

/** "58%", "8.5%", "−4%" (a server percent put into words; "—" for none). */
export function pctText(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const n = pctNumber(v);
  return `${v < 0 && n !== "0" ? "−" : ""}${n}%`;
}

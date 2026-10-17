/**
 * KPI-10 · Dashboard logic (pure): words for the rings, the gaps list and the
 * cards. Every figure is the server's; this only words and filters them.
 */
import type { FrameworkCode, KpiCoverage, KpiDashboardCard, KpiGap, KpiTopic } from "../../../lib/kpi/contracts";
import { FRAMEWORK_LABEL, TOPIC_LABEL } from "../../../lib/kpi/labels";
import { formatNumber } from "../../../ui/format";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** "6 gaps", "Core 7 of 9 · 9 gaps", "4 material topics · 11 gaps". */
export function ringSubtitle(c: KpiCoverage): string {
  const gaps = plural(c.missing, "gap", "gaps");
  if (c.core) return `Core ${c.core.done} of ${c.core.total} · ${gaps}`;
  if (c.material_topics !== null && c.material_topics !== undefined) return `${plural(c.material_topics, "material topic", "material topics")} · ${gaps}`;
  return gaps;
}

/** The ring's tooltip and screen-reader words: "GRI 82 percent ready: 18 approved, 2 pending, 2 missing of 22 required." */
export function ringDetail(c: KpiCoverage): string {
  const excluded = c.excluded ? `; ${plural(c.excluded, "disclosure", "disclosures")} left out with a reason` : "";
  return `${FRAMEWORK_LABEL[c.framework]} ${formatNumber(c.percent)} percent ready: ${formatNumber(c.approved)} approved, ${formatNumber(c.pending)} pending, ${formatNumber(c.missing)} missing of ${formatNumber(c.required)} required${excluded}.`;
}

/** Ring arc length for a percent (0–100, kept inside the ring). */
export function ringDash(percent: number, radius: number): { dash: number; circumference: number } {
  const circumference = 2 * Math.PI * radius;
  const p = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return { dash: (circumference * p) / 100, circumference };
}

/** "Jul, Aug, Sep missing", "2026 not entered", "Aug pending review". */
export function missingText(g: Pick<KpiGap, "periods_missing" | "pending">): string {
  const labels = g.periods_missing.map((p) => (/^\d{4}-\d{2}$/.test(p) ? MONTH_SHORT[Number(p.slice(5, 7)) - 1] : p));
  if (!labels.length) return g.pending ? "Pending review" : "Missing";
  if (g.pending) return `${labels.join(", ")} pending review`;
  if (labels.length === 1 && /^\d{4}$/.test(labels[0])) return `${labels[0]} not entered`;
  return `${labels.join(", ")} missing`;
}

/** Gaps a ring filter keeps: the server's frameworks for the gap, else the KPI's uses. */
export function gapsFor(gaps: KpiGap[], framework: FrameworkCode | null, frameworksOf: (kpiId: number) => FrameworkCode[]): KpiGap[] {
  if (!framework) return gaps;
  return gaps.filter((g) => (g.frameworks.length ? g.frameworks : frameworksOf(g.kpi_definition_id)).includes(framework));
}

/** Where "Open" goes: the server's link, else (for a Manager) the period's close view for the site. */
export function gapLink(g: KpiGap, role: string | null): string | null {
  if (g.link) return g.link;
  if (role !== "Manager") return null;
  const month = [...g.periods_missing].reverse().find((p) => /^\d{4}-\d{2}$/.test(p));
  const q = new URLSearchParams({ view: "kpi", step: "close" });
  if (month) q.set("period", month);
  if (g.site_id) q.set("site", String(g.site_id));
  return `/data/approvals?${q.toString()}`;
}

/** "−7 % vs 2025", "+4 % vs 2025", or null without last year. */
export function changeText(c: Pick<KpiDashboardCard, "change_pct">, year: number): string | null {
  if (c.change_pct === null || !Number.isFinite(c.change_pct)) return null;
  const pct = Math.round(c.change_pct);
  return `${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)} % vs ${year - 1}`;
}

/** Cards grouped by topic, in the order topics first appear. */
export function cardsByTopic(cards: KpiDashboardCard[]): { topic: KpiTopic; label: string; cards: KpiDashboardCard[] }[] {
  const out: { topic: KpiTopic; label: string; cards: KpiDashboardCard[] }[] = [];
  for (const c of cards) {
    const group = out.find((g) => g.topic === c.topic);
    if (group) group.cards.push(c);
    else out.push({ topic: c.topic, label: TOPIC_LABEL[c.topic] ?? c.topic, cards: [c] });
  }
  return out;
}

/** "Oct 2025" from "2025-10"; other labels as they come. */
export const periodShort = (p: string) => (/^\d{4}-\d{2}$/.test(p) ? `${MONTH_SHORT[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}` : p);

/** Years to pick: from the year KPI tracking started (or five back) to this one, newest first. */
export function yearOptions(firstYear: number | null | undefined, thisYear: number): number[] {
  const from = Math.min(firstYear ?? thisYear, thisYear) - 1;
  const out: number[] = [];
  for (let y = thisYear; y >= from; y -= 1) out.push(y);
  return out;
}

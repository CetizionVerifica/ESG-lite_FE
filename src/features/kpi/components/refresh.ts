import type { KpiAutoRefreshResult } from "../../../lib/kpi/contracts";

/** Roles that may read auto values again (`POST /kpi/auto/refresh`, Manager and above). */
export const REFRESH_ROLES = ["Manager", "Admin", "Superadmin"];
export const canRefreshAuto = (role: string | null | undefined) => !!role && REFRESH_ROLES.includes(role);

/** "4 values updated · 30 unchanged · 2 in closed periods left as they were." */
export function refreshSummary(r: KpiAutoRefreshResult): { title: string; description: string } {
  const parts = [`${r.unchanged} unchanged`];
  if (r.removed) parts.push(`${r.removed} removed (their rows are gone)`);
  if (r.locked) parts.push(`${r.locked} in closed periods left as they were`);
  if (r.formulas.length) parts.push(`${r.formulas.length} calculated ${r.formulas.length === 1 ? "value" : "values"} worked out again`);
  const title = r.refreshed ? `${r.refreshed} ${r.refreshed === 1 ? "value" : "values"} updated from your data` : "Your auto values were already up to date";
  return { title, description: `${parts.join(" · ")}.` };
}

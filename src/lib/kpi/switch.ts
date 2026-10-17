// KPI-1 · The company switch `kpi_tracking_enabled` (default off, Superadmin
// only, D2). With it off nothing KPI is visible or reachable: nav, routes,
// command palette, My month card, Approvals tab.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { getKpiStatus } from "../../services/kpiService";
import { useClientContext } from "../clientContext";

type CompanyLike = { kpi_tracking_enabled?: unknown } | null | undefined;
type SiteLike = { site_id?: number; company?: CompanyLike };

/**
 * True when a company the signed-in user works for has KPI tracking on, as
 * the session knows it. With `siteId`, that site's company decides; a site
 * the user doesn't have falls back to any of their companies.
 */
export function kpiTrackingOn(user: unknown, siteId?: number | null): boolean {
  const u = (user ?? {}) as { sites?: SiteLike[]; site?: SiteLike | null; company?: CompanyLike };
  const sites = u.sites?.length ? u.sites : u.site ? [u.site] : [];
  if (siteId != null) {
    const site = sites.find((s) => s.site_id === siteId);
    if (site) return site.company?.kpi_tracking_enabled === true;
  }
  return sites.some((s) => s.company?.kpi_tracking_enabled === true) || u.company?.kpi_tracking_enabled === true;
}

/** Query key of `GET /kpi/status`; the client switch invalidates `["kpi", "status"]`. */
export const kpiStatusKey = (companyId: number | null) => ["kpi", "status", companyId] as const;

/**
 * The server's answer wins over the session's copy (only as fresh as the last
 * sign-in or /auth/me). A body without a boolean `enabled` — an older server
 * or a test stub — leaves the session's value.
 */
export function resolveKpiTracking(fromServer: unknown, fromSession: boolean): boolean {
  return typeof fromServer === "boolean" ? fromServer : fromSession;
}

export interface KpiTrackingState {
  on: boolean;
  /** True while the first status answer is out and the session says off: wait before showing "not available". */
  checking: boolean;
}

/**
 * The switch for the signed-in user, refreshed from `GET /kpi/status` so a
 * change shows without signing in again. A Superadmin reads the selected
 * client's switch (off without a client).
 */
export function useKpiTrackingState(): KpiTrackingState {
  const { user, role } = useAuth();
  const { clientId } = useClientContext();
  const staff = role === "Superadmin";
  const companyId = staff ? clientId : null;
  const ask = !!role && (!staff || clientId !== null);
  const status = useQuery({
    queryKey: kpiStatusKey(companyId),
    queryFn: () => getKpiStatus(companyId),
    enabled: ask,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const session = staff ? false : kpiTrackingOn(user);
  return { on: resolveKpiTracking(status.data?.enabled, session), checking: ask && status.isPending && !session };
}

export function useKpiTracking(): boolean {
  return useKpiTrackingState().on;
}

/** True for an API error that says the company's switch is off (403 `KPI_TRACKING_OFF`). */
export function isKpiTrackingOff(error: unknown): boolean {
  const res = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)?.response;
  return res?.status === 403 && res.data?.code === "KPI_TRACKING_OFF";
}

/** The `company_id` KPI calls pass: the selected client for a Superadmin, none for a company's own people. */
export function useKpiCompanyId(): number | null {
  const { role } = useAuth();
  const { clientId } = useClientContext();
  return role === "Superadmin" ? clientId : null;
}

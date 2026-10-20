// IN-0 · The company switch `insights_enabled` (default off, Superadmin only,
// I2). With it off nothing about Insights is visible or reachable: nav item,
// route, command palette entry, Overview's "See insights" link. KPI panels
// additionally need KPI tracking; they hide themselves on `kpi_off`.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { getInsightsStatus } from "../../services/insightsService";
import { useClientContext } from "../clientContext";
import { kpiTrackingOn } from "../kpi/switch";
import { canOpenInsights, type InsightsStatus } from "./contracts";

type CompanyLike = { insights_enabled?: unknown } | null | undefined;
type SiteLike = { site_id?: number; company?: CompanyLike };

/**
 * True when a company the signed-in user works for has Insights on, as the
 * session knows it (the user's sites' companies, or an Admin's own company).
 * Users (contributors) never see Insights (I1), whatever the switch.
 */
export function insightsOn(user: unknown): boolean {
  const u = (user ?? {}) as { role?: unknown; sites?: SiteLike[]; site?: SiteLike | null; company?: CompanyLike };
  if (typeof u.role === "string" && !canOpenInsights(u.role)) return false;
  const sites = u.sites?.length ? u.sites : u.site ? [u.site] : [];
  return sites.some((s) => s.company?.insights_enabled === true) || u.company?.insights_enabled === true;
}

/** Query key of `GET /insights/status`; the client toggle invalidates `["insights", "status"]`. */
export const insightsStatusKey = (companyId: number | null) => ["insights", "status", companyId] as const;

/**
 * The server's answer wins over the session's copy (only as fresh as the last
 * sign-in or /auth/me). A body without a boolean `enabled` (an older server, a
 * test stub) leaves the session's values.
 */
export function resolveInsightsStatus(fromServer: Partial<InsightsStatus> | undefined, session: InsightsStatus): InsightsStatus {
  if (typeof fromServer?.enabled !== "boolean") return session;
  return { enabled: fromServer.enabled, kpi_tracking: fromServer.kpi_tracking === true };
}

export interface InsightsState extends InsightsStatus {
  /** True while the first status answer is out and the session says off: wait before showing "not turned on". */
  checking: boolean;
}

/**
 * The switch for the signed-in user, refreshed from `GET /insights/status` so a
 * change shows without signing in again. A Superadmin reads the selected
 * client's switch (off without a client). Users always read off.
 */
export function useInsights(): InsightsState {
  const { user, role } = useAuth();
  const { clientId } = useClientContext();
  const staff = role === "Superadmin";
  const allowed = canOpenInsights(role);
  const companyId = staff ? clientId : null;
  const ask = allowed && (!staff || clientId !== null);
  const status = useQuery({
    queryKey: insightsStatusKey(companyId),
    queryFn: () => getInsightsStatus(companyId),
    enabled: ask,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const sessionOn = allowed && !staff && insightsOn(user);
  const session: InsightsStatus = { enabled: sessionOn, kpi_tracking: !staff && kpiTrackingOn(user) };
  const resolved = allowed ? resolveInsightsStatus(status.data, session) : { enabled: false, kpi_tracking: false };
  return { ...resolved, checking: ask && status.isPending && !sessionOn };
}

/** A Superadmin on /insights with no client chosen yet: the page asks for one instead of saying "off". */
export function useInsightsNeedsClient(): boolean {
  const { role } = useAuth();
  const { clientId } = useClientContext();
  return role === "Superadmin" && clientId === null;
}

/**
 * Whether the "Insights" nav item, palette entry and Overview link show: the
 * switch for a company's own Managers and Admins; for a Superadmin, the chosen
 * client's switch, and also while no client is chosen (the page then asks for
 * one), as KPI and Design Studio do (D18).
 */
export function useInsightsNavOn(): boolean {
  const { enabled } = useInsights();
  const needsClient = useInsightsNeedsClient();
  return enabled || needsClient;
}

/** True for an API error that says the company's switch is off (403 `IN_OFF`). */
export function isInsightsOff(error: unknown): boolean {
  const res = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)?.response;
  return res?.status === 403 && res.data?.code === "IN_OFF";
}

/** The `company_id` Insights calls pass: the selected client for a Superadmin, none for a company's own people. */
export function useInsightsCompanyId(): number | null {
  const { role } = useAuth();
  const { clientId } = useClientContext();
  return role === "Superadmin" ? clientId : null;
}

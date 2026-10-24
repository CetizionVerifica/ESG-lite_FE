// DS-0 · The company switch `design_studio_enabled` (default off, Superadmin
// only, D4). With it off nothing about the studio is visible or reachable:
// nav, routes, command palette. The GHG kind needs only this switch; the
// sustainability kind also needs KPI tracking (`kindEnabled`).
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { getStudioStatus } from "../../services/studioService";
import { useClientContext } from "../clientContext";
import { kpiTrackingOn } from "../kpi/switch";
import type { ReportKind, StudioStatus } from "./contracts";

type CompanyLike = { design_studio_enabled?: unknown } | null | undefined;
type SiteLike = { site_id?: number; company?: CompanyLike };

/**
 * True when a company the signed-in user works for has the studio on, as the
 * session knows it (the user's sites' companies, or an Admin's own company).
 * With `siteId`, that site's company decides; a site the user doesn't have
 * falls back to any of their companies.
 */
export function designStudioOn(user: unknown, siteId?: number | null): boolean {
  const u = (user ?? {}) as { sites?: SiteLike[]; site?: SiteLike | null; company?: CompanyLike };
  const sites = u.sites?.length ? u.sites : u.site ? [u.site] : [];
  if (siteId != null) {
    const site = sites.find((s) => s.site_id === siteId);
    if (site) return site.company?.design_studio_enabled === true;
  }
  return sites.some((s) => s.company?.design_studio_enabled === true) || u.company?.design_studio_enabled === true;
}

/** Whether `kind` is available to the user, as the session knows it (D4). */
export function kindEnabled(user: unknown, kind: ReportKind): boolean {
  if (!designStudioOn(user)) return false;
  return kind === "ghg" ? true : kpiTrackingOn(user);
}

/** Query key of `GET /studio/status`; the client switch invalidates `["studio", "status"]`. */
export const studioStatusKey = (companyId: number | null) => ["studio", "status", companyId] as const;

const OFF_KINDS: Record<ReportKind, boolean> = { ghg: false, sustainability: false };

/**
 * The server's answer wins over the session's copy (only as fresh as the last
 * sign-in or /auth/me). A body without a boolean `enabled` (an older server, a
 * test stub) leaves the session's values.
 */
export function resolveStudioStatus(fromServer: Partial<StudioStatus> | undefined, session: StudioStatus): StudioStatus {
  if (typeof fromServer?.enabled !== "boolean") return session;
  const kinds = fromServer.kinds ?? OFF_KINDS;
  return {
    enabled: fromServer.enabled,
    kinds: { ghg: fromServer.enabled && kinds.ghg === true, sustainability: fromServer.enabled && kinds.sustainability === true },
  };
}

export interface DesignStudioState extends StudioStatus {
  /** True while the first status answer is out and the session says off: wait before showing "not available". */
  checking: boolean;
}

/**
 * The switch for the signed-in user, refreshed from `GET /studio/status` so a
 * change shows without signing in again. A Superadmin reads the selected
 * client's switch (off without a client). Users never use the studio, but the
 * hook still answers for them.
 */
export function useDesignStudio(): DesignStudioState {
  const { user, role } = useAuth();
  const { clientId } = useClientContext();
  const staff = role === "Superadmin";
  const companyId = staff ? clientId : null;
  const ask = !!role && (!staff || clientId !== null);
  const status = useQuery({
    queryKey: studioStatusKey(companyId),
    queryFn: () => getStudioStatus(companyId),
    enabled: ask,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const sessionOn = staff ? false : designStudioOn(user);
  const session: StudioStatus = {
    enabled: sessionOn,
    kinds: { ghg: sessionOn, sustainability: sessionOn && !staff && kpiTrackingOn(user) },
  };
  return { ...resolveStudioStatus(status.data, session), checking: ask && status.isPending && !sessionOn };
}

/** A Superadmin on a studio page with no client chosen yet: the page asks for one instead of saying "off". */
export function useStudioNeedsClient(): boolean {
  const { role } = useAuth();
  const { clientId } = useClientContext();
  return role === "Superadmin" && clientId === null;
}

/**
 * Whether the "Design Studio" nav item and palette entries show: the switch for
 * a company's own people; for a Superadmin, the chosen client's switch, and
 * also while no client is chosen (the pages then ask for one), as KPI (D18).
 */
export function useStudioNavOn(): { studio: boolean; sustainability: boolean } {
  const { enabled, kinds } = useDesignStudio();
  const needsClient = useStudioNeedsClient();
  return { studio: enabled || needsClient, sustainability: kinds.sustainability || needsClient };
}

/** True for an API error that says the company's studio switch is off (403 `DS_STUDIO_OFF`). */
export function isStudioOff(error: unknown): boolean {
  const res = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)?.response;
  return res?.status === 403 && res.data?.code === "DS_STUDIO_OFF";
}

/** True for 403 `DS_KIND_OFF`: a sustainability design while KPI tracking is off. */
export function isKindOff(error: unknown): boolean {
  const res = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)?.response;
  return res?.status === 403 && res.data?.code === "DS_KIND_OFF";
}

/** The `company_id` studio calls pass: the selected client for a Superadmin, none for a company's own people. */
export function useStudioCompanyId(): number | null {
  const { role } = useAuth();
  const { clientId } = useClientContext();
  return role === "Superadmin" ? clientId : null;
}

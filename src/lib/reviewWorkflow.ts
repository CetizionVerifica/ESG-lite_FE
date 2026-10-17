// S3-15 part 2 · The company switch `review_workflow_v2` (default off, D9).
// With it off the app looks exactly as before: no Draft words, no Submit, no
// "Nothing this month", no Close month view.
import { useAuth } from "../context/AuthContext";

type CompanyLike = { review_workflow_v2?: unknown } | null | undefined;
type SiteLike = { site_id?: number; company?: CompanyLike };

/** True when a company the signed-in user works for has the review workflow switched on. */
export function reviewWorkflowOn(user: unknown, siteId?: number | null): boolean {
  const u = (user ?? {}) as { sites?: SiteLike[]; site?: SiteLike | null; company?: CompanyLike };
  const sites = u.sites?.length ? u.sites : u.site ? [u.site] : [];
  if (siteId != null) {
    const site = sites.find((s) => s.site_id === siteId);
    if (site) return site.company?.review_workflow_v2 === true;
  }
  return sites.some((s) => s.company?.review_workflow_v2 === true) || u.company?.review_workflow_v2 === true;
}

/**
 * The switch for the signed-in user. A response that carries the switch itself
 * (`review_workflow_v2` on My month) wins over the session's copy, which is
 * only as fresh as the last sign-in or /auth/me.
 */
export function useReviewWorkflow(fromServer?: boolean | null, siteId?: number | null): boolean {
  const { user } = useAuth();
  return typeof fromServer === "boolean" ? fromServer : reviewWorkflowOn(user, siteId);
}

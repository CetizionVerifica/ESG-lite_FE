// Pure rules for the Connect Claude consent screen (IM10). No React, no network.
import type { ConsentRequestInfo, OauthScope } from "../../services/oauthService";

export const STAFF_ROLE = "Superadmin";

/** Message for any role but Superadmin (decision D4). */
export const SUPERADMIN_ONLY_MESSAGE = "Only ESGLite staff (Superadmin) can connect Claude.";

/** What each scope lets the app do, in the user's words. The order is fixed. */
const SCOPE_SENTENCES: Record<OauthScope, string> = {
  "imports:read": "Read your clients' sites, categories, data-entry forms and activity names.",
  "imports:write": "Create entries for review. It can't approve, edit or delete anything.",
};

/** What the app will never be able to do, shown under the allowed list. */
export const NEVER_SENTENCE = "It can't approve, reject, edit or delete entries, or change users, sites, factors or forms.";

export function scopeSentences(scopes: readonly { scope: string }[]): string[] {
  const known = (Object.keys(SCOPE_SENTENCES) as OauthScope[]).filter((s) => scopes.some((x) => x.scope === s));
  return known.map((s) => SCOPE_SENTENCES[s]);
}

/** Whether this signed-in person may press Allow. The server checks again. */
export function canAllow(info: Pick<ConsentRequestInfo, "can_allow" | "user">): boolean {
  return info.can_allow && info.user.role === STAFF_ROLE;
}

/** The refusal line for a person who may not connect, or null. */
export function refusalMessage(info: Pick<ConsentRequestInfo, "can_allow" | "refusal" | "user">): string | null {
  if (canAllow(info)) return null;
  return info.refusal?.message?.trim() || SUPERADMIN_ONLY_MESSAGE;
}

/** Hint when no client has Claude imports switched on yet. */
export function switchHint(count: number): string | null {
  if (count > 0) return null;
  return "No client has Claude imports switched on yet. Turn it on in the client's details (Allow Claude imports) before importing.";
}

/**
 * The browser is sent back to the app with window.location; only an http(s)
 * URL from the server is followed, never javascript: or a relative path.
 */
export function isSafeRedirect(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

interface ApiErrorLike {
  response?: { status?: number; data?: { code?: unknown; message?: unknown; redirect_to?: unknown } };
}

export interface ConsentError {
  /** The server's code when it sent one (OAUTH_REQUEST_INVALID, MCP_SUPERADMIN_ONLY…). */
  code: string | null;
  message: string;
  /** Where "Back to Claude" goes when the server offered a way back. */
  redirectTo: string | null;
}

/** Readable error for the request lookup or the decision call. */
export function consentError(error: unknown, fallback: string): ConsentError {
  const data = (error as ApiErrorLike | null)?.response?.data;
  const status = (error as ApiErrorLike | null)?.response?.status;
  const message = typeof data?.message === "string" && data.message.trim() ? data.message : status === undefined ? "We couldn't reach ESGLite. Check your connection and try again." : fallback;
  return {
    code: typeof data?.code === "string" ? data.code : null,
    message,
    redirectTo: isSafeRedirect(typeof data?.redirect_to === "string" ? data.redirect_to : null) ? (data!.redirect_to as string) : null,
  };
}

/** Where a signed-out person comes back to after signing in. */
export function consentPath(request: string): string {
  return `/oauth/consent?request=${encodeURIComponent(request)}`;
}

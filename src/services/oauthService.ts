import api from "../api/axios";

/**
 * Connect Claude (MCP import plan IM5/IM10): the consent request behind
 * `/oauth/consent?request=`, the decision, and the user's connected apps.
 * All calls run under the normal app session.
 */

export type OauthScope = "imports:read" | "imports:write";

export interface ConsentRequestInfo {
  client: { client_id: string; client_name: string; redirect_host: string; client_uri: string | null; logo_uri: string | null };
  scopes: { scope: OauthScope; description: string }[];
  resource: string;
  user: { user_id: number; name: string; email: string; role: string };
  can_allow: boolean;
  refusal: { code: string; message: string } | null;
  clients_with_imports_enabled: number;
  expires_at: string;
}

export interface ConsentDecision {
  decision: "allow" | "deny";
  redirect_to: string;
  grant_id?: number;
}

export interface OauthGrant {
  grant_id: number;
  client: { client_id: string; client_name: string; client_uri: string | null; logo_uri: string | null };
  scopes: OauthScope[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface GrantsResponse {
  grants: OauthGrant[];
  /** The URL to paste into Claude when adding ESGLite as a custom connector. */
  connector_url: string;
}

export const getConsentRequest = async (request: string): Promise<ConsentRequestInfo> => {
  const res = await api.get("/oauth/authorize/request", { params: { request } });
  return res.data;
};

export const decideConsent = async (request: string, decision: "allow" | "deny"): Promise<ConsentDecision> => {
  const res = await api.post("/oauth/authorize/decision", { request, decision });
  return res.data;
};

export const getGrants = async (): Promise<GrantsResponse> => {
  const res = await api.get("/oauth/grants");
  return res.data;
};

export const revokeGrant = async (grantId: number): Promise<void> => {
  await api.delete(`/oauth/grants/${grantId}`);
};

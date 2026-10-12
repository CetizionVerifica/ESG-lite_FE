import { useMutation, useQuery } from "@tanstack/react-query";
import { type ConsentDecision, decideConsent, getConsentRequest } from "../../services/oauthService";

export const consentKey = (request: string) => ["oauth", "consent", request] as const;

/** What the consent page shows for one signed request id. */
export function useConsentRequest(request: string | null) {
  return useQuery({
    queryKey: consentKey(request ?? ""),
    queryFn: () => getConsentRequest(request as string),
    enabled: !!request,
    retry: false,
    staleTime: Infinity,
  });
}

/** Allow or deny; the result carries where to send the browser. */
export function useDecide(request: string | null) {
  return useMutation<ConsentDecision, unknown, "allow" | "deny">({
    mutationFn: (decision) => decideConsent(request as string, decision),
  });
}

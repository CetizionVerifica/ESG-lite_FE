import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forgotPassword } from "../../services/authService";
import { type NotificationPreferences, getPreferences, updatePreferences } from "../../services/notificationService";
import { type GrantsResponse, getGrants, revokeGrant } from "../../services/oauthService";

export const preferencesKey = ["settings", "preferences"] as const;

/** Email toggles and timezone (GET /notifications/preferences). */
export function usePreferences() {
  return useQuery<NotificationPreferences>({
    queryKey: preferencesKey,
    queryFn: getPreferences,
  });
}

type PreferencesPatch = { notification_preferences?: Record<string, boolean>; timezone?: string };

/** Saves one section's fields; the cached preferences take the saved values. */
export function useSavePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: PreferencesPatch) => {
      await updatePreferences(patch);
      return patch;
    },
    onSuccess: (patch) => {
      queryClient.setQueryData<NotificationPreferences>(preferencesKey, (old) => ({
        notification_preferences: patch.notification_preferences ?? old?.notification_preferences ?? {},
        timezone: patch.timezone ?? old?.timezone ?? null,
      }));
    },
  });
}

/** Emails the user a reset link (the same flow as "Forgot password"). */
export function useSendResetLink() {
  return useMutation({ mutationFn: (email: string) => forgotPassword(email) });
}

export const grantsKey = ["settings", "connected-apps"] as const;

/** Apps connected to this account through OAuth (Claude), with the connector URL (IM10). */
export function useGrants(enabled: boolean) {
  return useQuery<GrantsResponse>({ queryKey: grantsKey, queryFn: getGrants, enabled });
}

/** Disconnect one app: its tokens stop working at once. */
export function useDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (grantId: number) => revokeGrant(grantId),
    onSuccess: (_, grantId) => {
      queryClient.setQueryData<GrantsResponse>(grantsKey, (old) => (old ? { ...old, grants: old.grants.filter((g) => g.grant_id !== grantId) } : old));
      void queryClient.invalidateQueries({ queryKey: grantsKey });
    },
  });
}

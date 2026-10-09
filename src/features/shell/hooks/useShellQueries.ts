import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotifications } from "../../../context/NotificationContext";
import { fetchBrand, fetchClients, fetchLatestNotifications, markAllAsRead, markAsRead, shellKeys } from "../api";

export function useLatestNotifications(enabled: boolean) {
  return useQuery({ queryKey: shellKeys.latestNotifications, queryFn: fetchLatestNotifications, enabled });
}

/** Marks one or all notifications read, then refreshes the badge and the list. */
export function useMarkRead() {
  const queryClient = useQueryClient();
  const { refresh } = useNotifications();
  return useMutation({
    mutationFn: (id: number | "all") => (id === "all" ? markAllAsRead() : markAsRead(id)),
    onSettled: () => {
      refresh();
      return queryClient.invalidateQueries({ queryKey: shellKeys.latestNotifications });
    },
  });
}

export function useClients(enabled: boolean) {
  return useQuery({ queryKey: shellKeys.clients, queryFn: fetchClients, enabled, staleTime: 5 * 60_000 });
}

export function useClientBrand(companyId: number | null) {
  return useQuery({
    queryKey: shellKeys.brand(companyId ?? 0),
    queryFn: () => fetchBrand(companyId as number),
    enabled: companyId !== null,
    staleTime: 5 * 60_000,
  });
}

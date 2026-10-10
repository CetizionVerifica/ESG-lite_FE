import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotifications } from "../../context/NotificationContext";
import { type NotificationItem, getNotifications, markAllAsRead, markAsRead } from "../../services/notificationService";
import { PAGE_SIZE, type Tab, matchesTab, tabQuery } from "./logic";

type ListData = { notifications: NotificationItem[]; total: number };

export const notificationKeys = {
  all: ["notifications"] as const,
  lists: ["notifications", "list"] as const,
  list: (tab: Tab, page: number) => ["notifications", "list", tab, page] as const,
  // Same key as the shell's bell popover, so marking here refreshes it.
  latest: ["notifications", "latest"] as const,
};

export function useNotificationList(tab: Tab, page: number) {
  return useQuery({
    queryKey: notificationKeys.list(tab, page),
    queryFn: async (): Promise<ListData> => {
      const { unreadOnly, type } = tabQuery(tab);
      const res = await getNotifications(page, PAGE_SIZE, unreadOnly, type);
      return { total: res.total, notifications: res.notifications.filter((n) => matchesTab(n, tab)) };
    },
    placeholderData: keepPreviousData,
  });
}

const setRead = (data: ListData | undefined, id: number | "all"): ListData | undefined =>
  data && { ...data, notifications: data.notifications.map((n) => (id === "all" || n.id === id ? { ...n, read: true } : n)) };

/**
 * Marks one notification or all of them read. The visible list updates in
 * place (a row read on the Unread tab stays until the next load, so it doesn't
 * jump away while open); the badge and the bell refresh.
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  const { refresh } = useNotifications();
  return useMutation({
    mutationFn: (id: number | "all") => (id === "all" ? markAllAsRead() : markAsRead(id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.lists });
      const previous = queryClient.getQueriesData<ListData>({ queryKey: notificationKeys.lists });
      queryClient.setQueriesData<ListData>({ queryKey: notificationKeys.lists }, (d) => setRead(d, id));
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      ctx?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      refresh();
      return queryClient.invalidateQueries({ queryKey: notificationKeys.latest });
    },
  });
}

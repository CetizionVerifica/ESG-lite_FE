import api from "../api/axios";

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  notification_preferences: Record<string, boolean>;
  timezone: string | null;
}

export const getNotifications = async (page = 1, limit = 20, unreadOnly = false) => {
  const params: any = { page, limit };
  if (unreadOnly) params.unread = "true";
  const response = await api.get<{ notifications: NotificationItem[]; total: number }>(
    "/notifications",
    { params }
  );
  return response.data;
};

export const getUnreadCount = async () => {
  const response = await api.get<{ count: number }>("/notifications/unread");
  return response.data.count;
};

export const markAsRead = async (id: number) => {
  const response = await api.patch(`/notifications/${id}/read`);
  return response.data;
};

export const markAllAsRead = async () => {
  const response = await api.patch("/notifications/read-all");
  return response.data;
};

export const getPreferences = async () => {
  const response = await api.get<NotificationPreferences>("/notifications/preferences");
  return response.data;
};

export const updatePreferences = async (data: {
  notification_preferences?: Record<string, boolean>;
  timezone?: string;
}) => {
  const response = await api.put("/notifications/preferences", data);
  return response.data;
};

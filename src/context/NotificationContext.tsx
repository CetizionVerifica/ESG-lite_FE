import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { getUnreadCount, getNotifications, NotificationItem } from "../services/notificationService";
import { useAuth } from "./AuthContext";

interface NotificationContextType {
  unreadCount: number;
  latestNotification: NotificationItem | null;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  unreadCount: 0,
  latestNotification: null,
  refresh: () => {},
});

const POLL_INTERVAL = 10_000; // 10 seconds

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestNotification, setLatestNotification] = useState<NotificationItem | null>(null);
  const prevCountRef = useRef(-1);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const count = await getUnreadCount();
      if (!mountedRef.current) return;

      // If count increased (and not first load), fetch latest for toast
      if (count > prevCountRef.current && prevCountRef.current >= 0) {
        try {
          const res = await getNotifications(1, 1, true);
          if (res.notifications.length > 0 && mountedRef.current) {
            setLatestNotification(res.notifications[0]);
          }
        } catch { /* silent */ }
      }

      prevCountRef.current = count;
      setUnreadCount(count);
    } catch {
      // silent
    }
  }, [isAuthenticated]);

  useEffect(() => {
    mountedRef.current = true;

    if (!isAuthenticated) {
      setUnreadCount(0);
      setLatestNotification(null);
      prevCountRef.current = -1;
      return;
    }

    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, refresh]);

  return (
    <NotificationContext.Provider value={{ unreadCount, latestNotification, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);

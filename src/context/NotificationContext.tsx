import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { getUnreadCount, NotificationItem } from "../services/notificationService";
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

const POLL_INTERVAL = 60_000;
const API_URL = import.meta.env.VITE_API_URL;
const MAX_RECONNECT = 5;

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, token } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestNotification, setLatestNotification] = useState<NotificationItem | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const count = await getUnreadCount();
      if (mountedRef.current) setUnreadCount(count);
    } catch {
      // silent
    }
  }, [isAuthenticated]);

  // SSE connection with auto-reconnect
  useEffect(() => {
    mountedRef.current = true;

    if (!isAuthenticated || !token) {
      setUnreadCount(0);
      setLatestNotification(null);
      // Cleanup any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      return;
    }

    const connect = () => {
      if (!mountedRef.current) return;

      const url = `${API_URL}/notifications/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener("unread", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (mountedRef.current) setUnreadCount(data.count);
          reconnectAttemptsRef.current = 0; // Connected successfully
        } catch { /* ignore */ }
      });

      es.addEventListener("notification", (e) => {
        try {
          const data = JSON.parse(e.data) as NotificationItem;
          if (mountedRef.current) setLatestNotification(data);
        } catch { /* ignore */ }
      });

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;

        // Reconnect with exponential backoff
        if (mountedRef.current && reconnectAttemptsRef.current < MAX_RECONNECT) {
          const delay = 1000 * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [isAuthenticated, token]);

  // Fallback polling when SSE is disconnected
  useEffect(() => {
    if (!isAuthenticated) return;
    refresh();
    const interval = setInterval(() => {
      if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
        refresh();
      }
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [isAuthenticated, refresh]);

  return (
    <NotificationContext.Provider value={{ unreadCount, latestNotification, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);

import { getBrand } from "../../services/brandService";
import { getCompanies } from "../../services/companyService";
import { getNotifications, markAllAsRead, markAsRead } from "../../services/notificationService";

export interface ClientOption {
  id: number;
  name: string;
}

export const shellKeys = {
  // Under "notifications" so the Notifications page (P13) refreshes the bell too.
  latestNotifications: ["notifications", "latest"] as const,
  clients: ["shell", "clients"] as const,
  brand: (companyId: number) => ["shell", "brand", companyId] as const,
};

export const POPOVER_SIZE = 8;

/** The bell lists the latest unread ones (P13). */
export const fetchLatestNotifications = async () => (await getNotifications(1, POPOVER_SIZE, true)).notifications;

export async function fetchClients(): Promise<ClientOption[]> {
  const data = await getCompanies();
  const list: { company_id: number; name: string }[] = Array.isArray(data) ? data : data?.companies ?? [];
  return list.map((c) => ({ id: c.company_id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
}

export { getBrand as fetchBrand, markAllAsRead, markAsRead };

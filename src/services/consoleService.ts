import api from "../api/axios";

/** GET /admin/console (Superadmin): one summary across every client (P16). */
export interface ConsoleSummary {
  /** Current calendar month, "YYYY-MM". */
  month: string;
  totals: {
    clients: number;
    active_clients: number;
    sites: number;
    users: number;
    emission_factors: number;
    /** Entries entered (not reported for) this month. */
    entries_this_month: number;
    pending_entries: number;
  };
  clients: { company_id: number; entries_this_month: number; pending_this_month: number; pending: number }[];
  activity: ConsoleActivity[];
}

export interface ConsoleActivity {
  kind: "bulk_upload" | "factor_upload" | "onboarding";
  at: string;
  company_id: number | null;
  company_name: string | null;
  site_id: number | null;
  site_name: string | null;
  category_name: string | null;
  rows: number | null;
  /** Bulk uploads only: rows still waiting for review. */
  pending: number | null;
  by: string | null;
  batch_id: string | null;
}

export const getConsoleSummary = async (limit = 8): Promise<ConsoleSummary> => {
  const response = await api.get("/admin/console", { params: { limit } });
  return response.data;
};

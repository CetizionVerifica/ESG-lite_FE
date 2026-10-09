import api from "../api/axios";

export type MyMonthStatus = "todo" | "pending" | "approved" | "rejected" | "covered";

export interface MyMonthRejection {
  pk_id: number;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface MyMonthCategory {
  category_id: number;
  category_name: string;
  scope: string | null;
  status: MyMonthStatus;
  filing: "monthly" | "yearly" | null;
  year_type: "CY" | "FY" | null;
  /** Window of the yearly filing (ISO dates), when the category is filed yearly. */
  period: { start: string; end: string } | null;
  entries: { total: number; pending: number; approved: number; rejected: number };
  total_emission: number;
  last_entry_at: string | null;
  rejections: MyMonthRejection[];
}

export interface MyMonthSite {
  site_id: number;
  name: string;
  categories: MyMonthCategory[];
}

export interface MyMonthResponse {
  /** YYYY-MM */
  month: string;
  /** YYYY-MM-DD: the 10th of the following month. */
  due_date: string;
  /** YYYY-MM-DD: the 15th of the following month. */
  escalation_date: string;
  summary: { total: number; due: number; done: number; pending: number; rejected: number };
  sites: MyMonthSite[];
}

/**
 * The signed-in contributor's checklist for a month (B5, GET /user/my-month).
 * Without `month` the backend picks the month currently due in the user's timezone.
 */
export const getMyMonth = async (month?: string): Promise<MyMonthResponse> => {
  const response = await api.get("/user/my-month", { params: month ? { month } : undefined });
  return response.data;
};

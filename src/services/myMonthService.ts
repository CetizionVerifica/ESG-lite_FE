import api from "../api/axios";

/** `draft`: only drafts so far (S3-15, with the review workflow on). */
export type MyMonthStatus = "todo" | "draft" | "pending" | "approved" | "rejected" | "covered";

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
  /** `draft`: S3-15 part 2, with the review workflow on; drafts don't count in `total` or the tCO₂e. */
  entries: { total: number; pending: number; approved: number; rejected: number; draft?: number };
  total_emission: number;
  last_entry_at: string | null;
  rejections: MyMonthRejection[];
  /** S3-15: the contributor marked the category "Nothing this month". */
  nothing_this_month?: boolean;
}

export interface MyMonthSite {
  site_id: number;
  name: string;
  categories: MyMonthCategory[];
  /** S3-15: the site's month is locked (closed by a manager); nothing can change until it's reopened. */
  locked?: boolean;
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
  /** S3-15: the company's review workflow switch, when the server sends it. */
  review_workflow_v2?: boolean;
}

/**
 * The signed-in contributor's checklist for a month (B5, GET /user/my-month).
 * Without `month` the backend picks the month currently due in the user's timezone.
 */
export const getMyMonth = async (month?: string): Promise<MyMonthResponse> => {
  const response = await api.get("/user/my-month", { params: month ? { month } : undefined });
  return readMyMonth(response.data);
};

/**
 * S3-15 part 2: ESG-lite marks "Nothing this month" as `nothing: true` and
 * `status: "nothing"`; the page reads `nothing_this_month` and keeps the
 * status words it orders by (a marked category is a to-do with the mark).
 */
export function readMyMonth(data: MyMonthResponse): MyMonthResponse {
  if (!data?.sites) return data;
  return {
    ...data,
    sites: data.sites.map((s) => ({
      ...s,
      categories: s.categories.map((c) => {
        const raw = c as MyMonthCategory & { nothing?: boolean };
        const status = String(raw.status);
        const nothing = raw.nothing === true || raw.nothing_this_month === true || status === "nothing";
        if (!nothing) return c;
        return { ...c, status: status === "nothing" ? "todo" : c.status, nothing_this_month: true };
      }),
    })),
  };
}

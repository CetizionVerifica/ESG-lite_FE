import { useSearchParams } from "react-router-dom";

export interface UploadContext {
  clientId: number | null;
  siteId: number | null;
  categoryId: number | null;
  /** "YYYY-MM": rows without their own date are filed on this month's last day. */
  month: string;
}

const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Client, site, category and month live in the URL (`?client=&site=&category=&period=`), so a link reopens the same upload. */
export function useUploadContext(): [UploadContext, (patch: Partial<UploadContext>) => void] {
  const [params, setParams] = useSearchParams();
  const period = params.get("period");
  const ctx: UploadContext = {
    clientId: num(params.get("client")),
    siteId: num(params.get("site")),
    categoryId: num(params.get("category")),
    month: period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : currentMonth(),
  };
  const set = (patch: Partial<UploadContext>) => {
    const next = { ...ctx, ...patch };
    const p = new URLSearchParams(params);
    const put = (k: string, v: number | string | null) => (v === null || v === "" ? p.delete(k) : p.set(k, String(v)));
    put("client", next.clientId);
    put("site", next.siteId);
    put("category", next.categoryId);
    put("period", next.month);
    setParams(p, { replace: true });
  };
  return [ctx, set];
}

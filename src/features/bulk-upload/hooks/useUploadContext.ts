import { useSearchParams } from "react-router-dom";

export interface UploadContext {
  clientId: number | null;
  siteId: number | null;
  categoryId: number | null;
  /** "YYYY-MM": rows without their own date are filed on this month's last day. */
  month: string;
  /** `?mode=`: smart, manual or historical; null means the page's default for the role. */
  mode: string | null;
}

const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Client, site, category, month and mode live in the URL (`?client=&site=&category=&period=&mode=`), so a link reopens the same upload. */
export function useUploadContext(): [UploadContext, (patch: Partial<UploadContext>) => void] {
  const [params, setParams] = useSearchParams();
  const period = params.get("period");
  const ctx: UploadContext = {
    clientId: num(params.get("client")),
    siteId: num(params.get("site")),
    categoryId: num(params.get("category")),
    month: period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? period : currentMonth(),
    mode: params.get("mode"),
  };
  const set = (patch: Partial<UploadContext>) => {
    const next = { ...ctx, ...patch };
    const own: Record<string, number | string | null> = { client: next.clientId, site: next.siteId, category: next.categoryId, period: next.month, mode: next.mode };
    // Other params pass through; ours are rewritten, and left out when empty.
    const p = new URLSearchParams([...params].filter(([k]) => !(k in own)));
    for (const [k, v] of Object.entries(own)) if (v !== null && v !== "") p.set(k, String(v));
    setParams(p, { replace: true });
  };
  return [ctx, set];
}

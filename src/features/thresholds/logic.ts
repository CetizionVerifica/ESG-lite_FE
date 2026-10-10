// ── Server shapes ───────────────────────────────────────────────────────────

export type Company = { company_id: number; name: string; status?: boolean };

/** `threshold_percentage` is a decimal column, so it can arrive as "3.50". */
export type Threshold = {
  threshold_id: number;
  threshold_percentage: number | string;
  updated_at?: string | null;
  company: { company_id: number; name: string } | null;
};

// ── Rules ───────────────────────────────────────────────────────────────────

/** What the backend uses for a client with no threshold row. */
export const DEFAULT_THRESHOLD = 5;
export const MIN_THRESHOLD = 2;
export const MAX_THRESHOLD = 5;
export const STEP = 0.01;

export const roundPct = (n: number): number => Math.round(n * 100) / 100;

/** Drops float noise from arrow-key steps (2.0300000000000002 → 2.03); leaves real extra decimals for validation. */
export const snapPct = (n: number | null): number | null => (n !== null && Math.abs(roundPct(n) - n) < 1e-9 ? roundPct(n) : n);

/** "3.5" → "3.50%". */
export const formatPct = (n: number): string => `${n.toFixed(2)}%`;

/** Error for a typed threshold, or undefined when it can be saved. */
export function validateThreshold(value: number | null): string | undefined {
  if (value === null || !Number.isFinite(value)) return `Enter a value between ${MIN_THRESHOLD}% and ${MAX_THRESHOLD}%.`;
  if (value < MIN_THRESHOLD || value > MAX_THRESHOLD) return `Must be between ${MIN_THRESHOLD}% and ${MAX_THRESHOLD}%.`;
  if (Math.abs(roundPct(value) - value) > 1e-9) return "Use at most two decimals.";
  return undefined;
}

// ── Rows ────────────────────────────────────────────────────────────────────

export type ThresholdRow = {
  company_id: number;
  name: string;
  active: boolean;
  /** Null when the client still uses the default. */
  threshold: { id: number; value: number; updated_at: string | null } | null;
};

/**
 * One row per client. Thresholds whose client isn't in the client list still
 * get a row so nothing saved is hidden; if the backend ever returns two for a
 * client, the most recently updated one wins.
 */
export function buildRows(companies: Company[], thresholds: Threshold[]): ThresholdRow[] {
  const byCompany = new Map<number, Threshold>();
  for (const t of thresholds) {
    const id = t.company?.company_id;
    if (id === undefined) continue;
    const prev = byCompany.get(id);
    if (!prev || (t.updated_at ?? "") > (prev.updated_at ?? "")) byCompany.set(id, t);
  }
  const toRow = (company_id: number, name: string, active: boolean): ThresholdRow => {
    const t = byCompany.get(company_id);
    const value = t ? Number(t.threshold_percentage) : NaN;
    return {
      company_id,
      name,
      active,
      threshold: t && Number.isFinite(value) ? { id: t.threshold_id, value, updated_at: t.updated_at ?? null } : null,
    };
  };
  const rows = companies.map((c) => toRow(c.company_id, c.name, c.status !== false));
  const known = new Set(companies.map((c) => c.company_id));
  for (const [id, t] of byCompany) if (!known.has(id)) rows.push(toRow(id, t.company?.name ?? `Client ${id}`, true));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export const effectiveValue = (row: ThresholdRow): number => row.threshold?.value ?? DEFAULT_THRESHOLD;

export type ValueKind = "custom" | "default";

export function matchesFilters(row: ThresholdRow, f: { q: string; kind: ValueKind | null }): boolean {
  if (f.kind === "custom" && !row.threshold) return false;
  if (f.kind === "default" && row.threshold) return false;
  const q = f.q.trim().toLowerCase();
  return !q || row.name.toLowerCase().includes(q);
}

export const toKind = (values: string[] | undefined): ValueKind | null => {
  const v = values?.[0];
  return v === "custom" || v === "default" ? v : null;
};

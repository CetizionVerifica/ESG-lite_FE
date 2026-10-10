import type { Declaration, DeclarationStage, FootprintStatus } from "../../services/pcfExportService";

export const STAGES: { id: DeclarationStage; label: string }[] = [
  { id: "A1", label: "Raw materials" },
  { id: "A2", label: "Inbound transport" },
  { id: "A3_energy", label: "Plant energy" },
  { id: "A3_packaging", label: "Packaging" },
  { id: "A3_waste", label: "Production waste" },
];

export const STATUS_LABEL: Record<FootprintStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  superseded: "Superseded",
};

/** PACT files are only issued for reviewed footprints; drafts get PDF and CSV with a DRAFT mark. */
export const canExportPact = (status: FootprintStatus) => status === "approved" || status === "published" || status === "superseded";

export type StageRow = { id: DeclarationStage; label: string; value: number | null; withheld: boolean; sharePct: number | null };

/** Stage rows in the fixed A1 → A3 order; a stage holding a licensed line is withheld. */
export function stageRows(d: Pick<Declaration, "by_stage" | "hidden_stages" | "total_kg_per_unit">): StageRow[] {
  return STAGES.map(({ id, label }) => {
    const withheld = d.hidden_stages.includes(id);
    const value = withheld ? null : (d.by_stage[id] ?? 0);
    const sharePct = value === null || d.total_kg_per_unit <= 0 ? null : (value / d.total_kg_per_unit) * 100;
    return { id, label, value, withheld, sharePct };
  });
}

/** Up to 4 significant decimals for small per-unit values, 2 for larger ones. */
export function formatKg(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const digits = abs !== 0 && abs < 1 ? 4 : 2;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/** "CY 2024 (1 Jan 2024 – 31 Dec 2024)" or "FY 2024–25 (…)". */
export function periodLabel(p: Declaration["reference_period"]): string {
  const y = Number(p.start.slice(0, 4));
  const name = p.year_type === "FY" ? `FY ${y}–${String(y + 1).slice(2)}` : `CY ${y}`;
  return `${name} (${day(p.start)} – ${day(p.end)})`;
}

export const boundaryLabel = (b: string) => (b === "cradle_to_grave" ? "Cradle to grave" : "Cradle to gate");

export function standardLabel(s: string) {
  return s.trim().toLowerCase().replace(/[\s-]/g, "") === "iso14067" ? "ISO 14067" : s;
}

export const allocationLabel = (key: string) => key.replace(/_/g, " ");

/** The file name from a Content-Disposition header, or the fallback. */
export function fileNameFrom(disposition: string | null | undefined, fallback: string): string {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? "");
  return m ? decodeURIComponent(m[1]) : fallback;
}

/** The message in an error response; blob responses carry it as JSON text. */
export async function errorMessage(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  try {
    if (data instanceof Blob) {
      const parsed = JSON.parse(await data.text()) as { message?: string };
      return parsed.message || fallback;
    }
    if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") return (data as { message: string }).message;
  } catch {
    // not JSON
  }
  return fallback;
}

export const errorStatus = (err: unknown): number | undefined => (err as { response?: { status?: number } })?.response?.status;

/** "Rod-12-v1.pdf" → "Rod-12-v1-DRAFT.pdf" for an unapproved footprint. */
export function draftName(fileName: string, draft: boolean): string {
  if (!draft) return fileName;
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? `${fileName.slice(0, dot)}-DRAFT${fileName.slice(dot)}` : `${fileName}-DRAFT`;
}

/** Saves a blob through a temporary link. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

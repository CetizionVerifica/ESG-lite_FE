// C06 supplier data requests: pure helpers for the page, the Ask modal and
// the review drawer. No React here, so they are unit-tested as they are.
import type { DeclarationField, DeclarationFieldName, DeclarationResponse } from "../../services/pcfAiService";
import type { Boundary, SupplierRequest, SupplierRequestStatus } from "../../services/supplierRequestService";

export type { Boundary, SupplierRequest, SupplierRequestStatus };

export const STATUSES: SupplierRequestStatus[] = ["sent", "opened", "received", "accepted", "rejected", "expired"];

export const STATUS_LABEL: Record<SupplierRequestStatus, string> = {
  sent: "Sent",
  opened: "Opened",
  received: "Received",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
};

export const STATUS_TONE: Record<SupplierRequestStatus, "neutral" | "info" | "warn" | "good" | "bad"> = {
  sent: "neutral",
  opened: "info",
  received: "warn",
  accepted: "good",
  rejected: "bad",
  expired: "neutral",
};

export const BOUNDARIES: Boundary[] = ["cradle_to_gate", "cradle_to_grave", "gate_to_gate"];

export const BOUNDARY_LABEL: Record<Boundary, string> = {
  cradle_to_gate: "Cradle-to-gate (A1–A3)",
  cradle_to_grave: "Cradle-to-grave",
  gate_to_gate: "Gate-to-gate",
};

export const boundaryLabel = (b: string | null | undefined): string => (b && b in BOUNDARY_LABEL ? BOUNDARY_LABEL[b as Boundary] : b ?? "—");

export const PCF_UNITS = ["kg", "t", "m2", "kWh", "tonne.km", "unit"] as const;

export const unitLabel = (u: string) => (u === "m2" ? "m²" : u);

/** The row's product and version, e.g. "EC-grade wire rod · v2". */
export const studyLabel = (r: SupplierRequest): string =>
  r.study ? `${r.study.product?.name ?? "Footprint"} · v${r.study.version}` : "—";

/** Value column: the accepted figure, else what the supplier sent, else nothing. */
export function valueText(r: SupplierRequest): { text: string; pending: boolean } {
  const kg = (v: number) => `${v.toLocaleString("en-GB", { maximumFractionDigits: 4 })} kgCO₂e/${unitLabel(r.unit)}`;
  if (r.accepted?.value_kgco2e != null) return { text: kg(r.accepted.value_kgco2e), pending: false };
  if (r.reply?.value_kgco2e != null) return { text: kg(r.reply.value_kgco2e), pending: r.status === "received" };
  if (r.reply?.file) return { text: `File: ${r.reply.file.name}`, pending: r.status === "received" };
  return { text: "—", pending: false };
}

/** Validity column: "to 31 Dec 2027", "expired 1 Jan 2024", or nothing. */
export function validityText(r: SupplierRequest, today = new Date()): { text: string; expired: boolean } {
  const to = r.reply?.valid_to ?? null;
  if (!to) return { text: "—", expired: false };
  const end = new Date(`${to}T23:59:59Z`);
  const label = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const expired = end.getTime() < today.getTime();
  return { text: expired ? `Expired ${label}` : `To ${label}`, expired };
}

/** What the "Due" column shows, and whether it has passed without an answer. */
export function dueText(r: SupplierRequest, today = new Date()): { text: string; overdue: boolean } {
  if (!r.due_date) return { text: "—", overdue: false };
  const d = new Date(`${r.due_date}T23:59:59Z`);
  const text = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const overdue = (r.status === "sent" || r.status === "opened" || r.status === "expired") && d.getTime() < today.getTime();
  return { text, overdue };
}

export type AcceptForm = {
  value_kgco2e: number | null;
  boundary: Boundary | null;
  standard: string;
  gwp_set: "AR6" | "AR5";
  valid_from: string;
  valid_to: string;
  verifier: string;
  comment: string;
};

/** The review form starts from what the supplier typed. */
export function formFromReply(r: SupplierRequest): AcceptForm {
  const p = r.reply;
  return {
    value_kgco2e: p?.value_kgco2e ?? null,
    boundary: p?.boundary ?? null,
    standard: p?.standard ?? "",
    gwp_set: p?.gwp_set === "AR5" ? "AR5" : "AR6",
    valid_from: p?.valid_from ?? "",
    valid_to: p?.valid_to ?? "",
    verifier: p?.verifier ?? "",
    comment: "",
  };
}

const text = (v: DeclarationField | undefined): string => (v?.value === null || v?.value === undefined ? "" : String(v.value));

/**
 * The review form after the AI read the file: a read field replaces the
 * typed one only when the file says something (null leaves the typed value).
 */
export function formFromDeclaration(form: AcceptForm, d: DeclarationResponse): AcceptForm {
  const f = d.fields;
  const value = f.value_kgco2e?.value;
  const boundary = f.boundary?.value;
  const gwp = f.gwp_set?.value;
  return {
    ...form,
    value_kgco2e: typeof value === "number" ? value : form.value_kgco2e,
    boundary: typeof boundary === "string" && BOUNDARIES.includes(boundary as Boundary) ? (boundary as Boundary) : form.boundary,
    standard: text(f.standard) || form.standard,
    gwp_set: gwp === "AR5" ? "AR5" : gwp === "AR6" ? "AR6" : form.gwp_set,
    valid_from: text(f.valid_from) || form.valid_from,
    valid_to: text(f.valid_to) || form.valid_to,
    verifier: text(f.verifier) || form.verifier,
  };
}

export const AI_CHIP_FIELDS: { key: DeclarationFieldName; label: string }[] = [
  { key: "value_kgco2e", label: "Value" },
  { key: "declared_unit", label: "Per" },
  { key: "boundary", label: "Boundary" },
  { key: "standard", label: "Standard" },
  { key: "gwp_set", label: "GWP" },
  { key: "reference_start", label: "Period from" },
  { key: "reference_end", label: "Period to" },
  { key: "valid_from", label: "Valid from" },
  { key: "valid_to", label: "Valid to" },
  { key: "verifier", label: "Verifier" },
  { key: "supplier_name", label: "Supplier" },
  { key: "product_name", label: "Product" },
];

export const LOW_CONFIDENCE = 60;

/** What a chip shows for one AI-read field. */
export function chipText(key: DeclarationFieldName, f: DeclarationField): string {
  if (f.value === null || f.value === undefined) return "—";
  if (key === "boundary") return boundaryLabel(String(f.value));
  if (key === "value_kgco2e") return typeof f.value === "number" ? f.value.toLocaleString("en-GB", { maximumFractionDigits: 4 }) : String(f.value);
  if (key === "declared_unit") return unitLabel(String(f.value));
  return String(f.value);
}

/** Why the figure can't be accepted yet, or null. */
export function acceptProblem(r: SupplierRequest, form: AcceptForm, confirmBoundary: boolean): string | null {
  if (form.value_kgco2e === null || !Number.isFinite(form.value_kgco2e) || form.value_kgco2e < 0) return "Enter the value in kgCO₂e per unit.";
  if (form.boundary && r.study && form.boundary !== r.study.boundary && !confirmBoundary) {
    return `The figure is ${boundaryLabel(form.boundary).toLowerCase()}, this footprint is ${boundaryLabel(r.study.boundary).toLowerCase()}. Confirm to accept it anyway.`;
  }
  if (form.valid_from && form.valid_to && form.valid_to < form.valid_from) return "Valid to must be on or after valid from.";
  return null;
}

export type AskForm = {
  study_id: number | null;
  input_id: number | null;
  material: string;
  unit: string;
  supplier_name: string;
  supplier_email: string;
  due_date: string;
  note: string;
};

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why the request can't be sent yet, or null. */
export function askProblem(f: AskForm, today = new Date().toISOString().slice(0, 10)): string | null {
  if (f.study_id === null) return "Choose a footprint.";
  if (!f.material.trim()) return "Say which material the figure is for.";
  if (!(PCF_UNITS as readonly string[]).includes(f.unit)) return "Choose the unit the figure is wanted per.";
  if (!EMAIL.test(f.supplier_email.trim())) return "Enter the supplier's email address.";
  if (f.due_date && f.due_date < today) return "The due date can't be in the past.";
  return null;
}

/**
 * Parse `?new=1&study=&input=` into the Ask form's starting point. The
 * Suppliers page (S3-6) adds `&supplier=&email=` to fill in who is asked.
 */
export function askParams(params: URLSearchParams): { open: boolean; study_id: number | null; input_id: number | null; supplier_name: string; supplier_email: string } {
  const id = (k: string) => {
    const n = Number(params.get(k));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const text = (k: string, max: number) => (params.get(k) ?? "").trim().slice(0, max);
  return { open: params.get("new") === "1", study_id: id("study"), input_id: id("input"), supplier_name: text("supplier", 200), supplier_email: text("email", 200) };
}

type AxiosLike = { response?: { status?: number; data?: { message?: unknown; boundary_mismatch?: unknown } } };

export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as AxiosLike)?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

export const isBoundaryRefusal = (e: unknown): boolean => (e as AxiosLike)?.response?.status === 409 && (e as AxiosLike)?.response?.data?.boundary_mismatch === true;

export type SupplierForm = {
  value: number | null;
  boundary: Boundary | null;
  standard: string;
  reference_start: string;
  reference_end: string;
  valid_from: string;
  valid_to: string;
  verifier: string;
  product_name: string;
  note: string;
};

export const BLANK_SUPPLIER_FORM: SupplierForm = { value: null, boundary: null, standard: "", reference_start: "", reference_end: "", valid_from: "", valid_to: "", verifier: "", product_name: "", note: "" };

/** C06 supplier page: why the answer can't be sent yet, or null. */
export function submitProblem(f: SupplierForm, file: File | null): string | null {
  if (f.value === null && !file) return "Upload your declaration or type the value.";
  if (f.value !== null && (!Number.isFinite(f.value) || f.value < 0)) return "The value must be a number of 0 or more.";
  if (f.value !== null && !f.boundary) return "Say which system boundary the value covers.";
  if (f.reference_start && f.reference_end && f.reference_end < f.reference_start) return "The reference period's end must be on or after its start.";
  if (f.valid_from && f.valid_to && f.valid_to < f.valid_from) return "Valid to must be on or after valid from.";
  return null;
}

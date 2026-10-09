// Bills read by the AI service, turned into ordinary entry rows. Moved from
// the legacy page's handleInvoiceUpload / handleReuseInvoice: the same label →
// option id conversion (parents first), unit normalisation and emission
// category mapping, so a bill row is the same row a person would type.
// What the AI filled, how sure it was and which bill a row came from ride
// along in `row._bill`, which buildPayload never sends.
import type { CategorySuggestion, ExtractionResponse, InvoiceData, ValidationCheck } from "../../../services/invoiceService";
import { formatDate } from "../../../ui/format";
import { entryDate, entryPeriodLabel, type EntryPeriod } from "./entry";
import { autoEmissionCategory, columnOptionsFor, isSelectColumn, newRow, parentColumnOf, type FormModel } from "../../../lib/emissions/form";
import type { EmissionFactor, ModalRow } from "../../../lib/emissions/types";

/** Category confidence (0–100) below which the suggestion is shown as unsure. */
export const LOW_CONFIDENCE = 60;

export interface BillSource {
  /** python_AI_service invoice id: links the bill as evidence once rows are saved (B8). */
  invoiceId: number | null;
  /** Unique per upload or reuse, so two reads of one file stay separate groups. */
  uploadKey: string;
  fileName: string;
  fileType: string;
  url: string | null;
}

export interface BillMeta {
  /** Groups the rows of one invoice in one file. */
  key: string;
  invoiceId: number | null;
  fileName: string;
  fileType: string;
  url: string | null;
  vendor: string | null;
  number: string | null;
  /** Billing month end, else invoice date (YYYY-MM-DD). */
  date: string | null;
  amount: number | null;
  currency: string | null;
  warnings: string[];
  /** Fields the AI filled that nobody has changed yet. */
  ai: string[];
  /** Confidence (0–100) of the category suggestion, when the row's category is that suggestion. */
  confidence: number | null;
  /** The user checked these rows; until then Review is blocked. */
  confirmed: boolean;
}

export const billOf = (row: ModalRow): BillMeta | null => (row._bill as BillMeta | undefined) ?? null;

const lower = (s: string) => s.toLowerCase();

/** Warnings worth showing for one invoice: failed checks, in words. */
export function billWarnings(checks: ValidationCheck[] | undefined): string[] {
  const out: string[] = [];
  for (const v of checks ?? []) {
    // Per-activity "no unit / no match" checks show as row issues instead.
    if (v.ok || v.check === "activity_unit_defined") continue;
    if (v.check === "subtotal_plus_tax_equals_total" && v.delta != null) {
      out.push(`The total doesn't match subtotal plus tax (off by ${v.delta.toLocaleString("en-US", { maximumFractionDigits: 2 })}).`);
    } else if (v.message) out.push(v.message);
  }
  return out;
}

/** A label the AI returned for a select, as the option id the form stores. */
function toOptionIds(model: FormModel, row: ModalRow) {
  const selects = model.columns.filter((c) => isSelectColumn(model, c));
  const resolved = new Set<string>();
  // Parents before children, so a child's options follow its resolved parent.
  let progress = true;
  while (progress) {
    progress = false;
    for (const col of selects) {
      const name = col.column_name;
      if (resolved.has(name)) continue;
      const parent = parentColumnOf(model, name);
      if (parent && !resolved.has(parent) && selects.some((c) => c.column_name === parent)) continue;
      const raw = row[name];
      if (raw) {
        const options = columnOptionsFor(model, col, parent ? String(row[parent] ?? "") || undefined : undefined);
        const hit = options.find((o) => lower(o.label) === lower(String(raw)));
        if (hit) row[name] = String(hit.id);
      }
      resolved.add(name);
      progress = true;
    }
  }
}

function invoiceHeader(data: InvoiceData | undefined) {
  return {
    vendor: data?.vendor_name ?? null,
    number: data?.invoice_number ?? null,
    date: data?.billing_month_end ?? data?.invoice_date ?? null,
    amount: data?.total_amount ?? null,
    currency: data?.currency ?? null,
  };
}

/**
 * Rows for every activity the AI found in one file. Rows start unconfirmed.
 * Rows are filed in the page's period, not on the bill's date (see billDateNote).
 */
export function billRowsFrom(
  model: FormModel,
  response: ExtractionResponse,
  ctx: { source: BillSource; units: string[]; factors: EmissionFactor[]; firstId: number },
): ModalRow[] {
  const columnByLower = new Map(model.columns.map((c) => [lower(c.column_name), c.column_name]));
  return (response.emission ?? []).map((em, i) => {
    const row = newRow(model, ctx.firstId + i);
    const ai: string[] = [];
    for (const [key, value] of Object.entries(em.activity_data ?? {})) {
      const name = columnByLower.get(lower(key)) ?? key;
      row[name] = String(value ?? "");
      if (row[name] !== "" && model.columns.some((c) => c.column_name === name)) ai.push(name);
    }
    toOptionIds(model, row);

    if (em.activity_data_unit) {
      const unit = ctx.units.find((u) => lower(u) === lower(em.activity_data_unit as string));
      row.activity_data_unit = unit ?? em.activity_data_unit;
      ai.push("activity_data_unit");
    }

    const suggestion: CategorySuggestion | null = response.suggested_categories?.[i] ?? null;
    const auto = autoEmissionCategory(model, row);
    if (auto) {
      row.emission_category = auto.category;
      row._ecmKey = auto.key;
    } else if (row.emission_category) {
      const factor = ctx.factors.find((f) => lower(f.emission_category_name) === lower(String(row.emission_category)));
      if (factor) row.emission_category = factor.emission_category_name;
    }
    if (row.emission_category && !ai.includes("emission_category")) ai.push("emission_category");

    const invoiceIndex = em.invoice_index ?? 0;
    const meta: BillMeta = {
      key: `${ctx.source.uploadKey}:${invoiceIndex}`,
      invoiceId: ctx.source.invoiceId,
      fileName: ctx.source.fileName,
      fileType: ctx.source.fileType,
      url: ctx.source.url,
      ...invoiceHeader(response.data?.[invoiceIndex]),
      warnings: billWarnings(response.validations?.[invoiceIndex]),
      ai,
      confidence:
        !auto && suggestion && row.emission_category && lower(suggestion.emission_category_name) === lower(String(row.emission_category))
          ? suggestion.confidence
          : null,
      confirmed: false,
    };
    if (!meta.date && em.date_of_reporting) meta.date = em.date_of_reporting;
    row._bill = meta;
    return row;
  });
}

/** The row after a person edits `field`: that field is theirs now, not the AI's. */
export function markEdited(row: ModalRow, field: string): ModalRow {
  const bill = billOf(row);
  if (!bill || !bill.ai.includes(field)) return row;
  const ai = bill.ai.filter((f) => f !== field);
  // A hand-picked category no longer carries the suggestion's confidence.
  return { ...row, _bill: { ...bill, ai, confidence: field === "emission_category" ? null : bill.confidence } };
}

export const isAiField = (row: ModalRow, field: string) => billOf(row)?.ai.includes(field) ?? false;

/** One entry per bill, in the order the rows appear. */
export function billGroups(rows: ModalRow[]): { bill: BillMeta; rows: ModalRow[] }[] {
  const groups = new Map<string, { bill: BillMeta; rows: ModalRow[] }>();
  for (const row of rows) {
    const bill = billOf(row);
    if (!bill) continue;
    const g = groups.get(bill.key);
    if (g) g.rows.push(row);
    else groups.set(bill.key, { bill, rows: [row] });
  }
  return [...groups.values()];
}

/** When the bill's date falls outside the period its rows are filed in, a line saying so. */
export function billDateNote(date: string | null, period: EntryPeriod): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const end = entryDate(period);
  const start =
    period.mode === "monthly" ? `${end.slice(0, 7)}-01` : period.yearType === "CY" ? `${period.year}-01-01` : `${period.year}-04-01`;
  const day = date.slice(0, 10);
  if (day >= start && day <= end) return null;
  return `This bill is dated ${formatDate(day)}. Its rows are filed in ${entryPeriodLabel(period)}; change the period if that's wrong.`;
}

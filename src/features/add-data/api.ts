import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { type SupplierDetail, createSupplier, getSupplier, getSuppliers } from "../../services/scope3SuppliersService";
import { getUserColumnConfigsBySiteAndCategory } from "../../services/columnConfigService";
import { getUserEmissionFactorsBySiteAndCategory } from "../../services/emissionFactorService";
import { getUserUnitsBySiteAndCategory, type UnitData } from "../../services/unitService";
import { getMappingsByCompany, type CategoryMapping } from "../../services/categoryMappingService";

export type { CategoryMapping };
import { createEmission, getEmissionsPaginated, getPeriodMode, getPeriodTotal, updateEmission } from "../../services/emissionService";
import { getThresholdByCompany } from "../../services/thresholdService";
import { getSiteById } from "../../services/siteService";
import { type BackedEntry, findBackedEntries, linkInvoiceDocuments, uploadMultipleDocuments } from "../../services/documentService";
import { calculateRoadDistance, calculateSeaDistance } from "../../services/distanceService";
import { resolveLocationFromBackend, type ResolvedLocation } from "../../services/locationService";
import {
  bulkDeleteInvoices,
  deleteInvoice,
  getInvoices,
  reextractInvoice,
  uploadAndExtractInvoice,
  type ExtractionResponse,
  type Invoice,
} from "../../services/invoiceService";
import { entryDate, periodTotalQuery, previousPeriod, type EmissionPayload, type EntryPeriod } from "./logic/entry";
import { editOf, entriesQuery, entryInPeriod, type SavedEntry } from "./logic/existing";
import { BILL_UNREADABLE, billErrorMessage, billOf } from "./logic/bill";
import type { ColumnConfig, EmissionFactor, ModalRow } from "./types";

/**
 * Everything the form needs for one site × category. Factors come for every
 * year: when the factor year has none, the backend saves with the newest
 * other year, and the preview has to see those factors to say so.
 */
export interface EntrySetup {
  config: ColumnConfig | null;
  factors: EmissionFactor[];
  units: string[];
  mappings: CategoryMapping[];
  /** FERA factors when the site has a FERA category (the backend adds the FERA row on save). */
  feraFactors: EmissionFactor[];
}

const unitNames = (units: UnitData[]) => units.map((u) => u.unit_name);

export function useEntrySetup(args: {
  siteId: number | null;
  categoryId: number | null;
  factorYear: number | null;
  companyId: number | null;
  feraCategoryId: number | null;
}) {
  const { siteId, categoryId, factorYear, companyId, feraCategoryId } = args;
  return useQuery({
    queryKey: ["add-data", "setup", siteId, categoryId, companyId, feraCategoryId],
    enabled: siteId !== null && categoryId !== null && factorYear !== null,
    queryFn: async (): Promise<EntrySetup> => {
      const site = siteId as number;
      const category = categoryId as number;
      const [configs, factors, units, mappings, fera] = await Promise.all([
        getUserColumnConfigsBySiteAndCategory(site, category) as Promise<ColumnConfig[]>,
        getUserEmissionFactorsBySiteAndCategory(site, category) as Promise<EmissionFactor[]>,
        getUserUnitsBySiteAndCategory(site, category) as Promise<UnitData[]>,
        // Optional extras: the form still works without them.
        companyId ? getMappingsByCompany(companyId, site, category).catch(() => []) : Promise.resolve([]),
        feraCategoryId
          ? Promise.all([
              getUserEmissionFactorsBySiteAndCategory(site, feraCategoryId).catch(() => []),
              getUserUnitsBySiteAndCategory(site, feraCategoryId).catch(() => []),
            ])
          : Promise.resolve([[], []] as [EmissionFactor[], UnitData[]]),
      ]);
      const names = unitNames(units);
      const known = new Set(names.map((n) => n.toLowerCase()));
      const feraUnits = unitNames(fera[1] as UnitData[]).filter((n) => !known.has(n.toLowerCase()));
      return {
        config: configs[0] ?? null,
        factors,
        units: [...names, ...feraUnits],
        mappings,
        feraFactors: fera[0] as EmissionFactor[],
      };
    },
  });
}

export function useThreshold(companyId: number | null) {
  return useQuery({
    queryKey: ["add-data", "threshold", companyId],
    enabled: companyId !== null,
    // The legacy page assumes 5% when the company has none.
    queryFn: () => getThresholdByCompany(companyId as number).catch(() => 5),
  });
}

/**
 * Per emission category: last period's approved total and this period's
 * entered total, for the "▲ 6% vs Aug" chip. A failed lookup reads as 0, as on
 * the legacy page.
 */
export function usePeriodTotals(args: { siteId: number | null; categoryId: number | null; period: EntryPeriod | null; emissionCategories: string[] }) {
  const { siteId, categoryId, period, emissionCategories } = args;
  const enabled = siteId !== null && categoryId !== null && period !== null;
  const results = useQueries({
    queries: emissionCategories.flatMap((emissionCategory) =>
      (["approved", "entered"] as const).map((basis) => {
        const p = period && (basis === "approved" ? previousPeriod(period) : period);
        return {
          queryKey: ["add-data", "period-total", siteId, categoryId, p, emissionCategory, basis],
          enabled,
          queryFn: () =>
            getPeriodTotal({
              siteId: siteId as number,
              categoryId: categoryId as number,
              emissionCategory,
              ...periodTotalQuery(p as EntryPeriod),
              basis,
            }).catch(() => 0),
        };
      }),
    ),
  });
  const totals: Record<string, { previous: number | null; saved: number | null }> = {};
  emissionCategories.forEach((name, i) => {
    totals[name] = { previous: results[i * 2]?.data ?? null, saved: results[i * 2 + 1]?.data ?? null };
  });
  return totals;
}

export type SaveOutcome =
  /** `warnings`: the engine's notes that never block (an older factor year, no FERA factor), shown on the result line (S3-4). */
  /** `status`: what the row was saved as; `draft` with the review workflow on (S3-15), otherwise `pending`. */
  | { kind: "saved"; emissionId: number | null; warnings?: string[]; status?: string | null }
  | { kind: "duplicate"; message: string; existing: { tco2e: number | null; status: string | null } | null }
  /** `methodNotAllowed`: the form doesn't offer the row's method (S3-3 METHOD_NOT_ALLOWED); the message names the ones it does. */
  | { kind: "error"; message: string; modeLock: boolean; methodNotAllowed?: boolean };

interface ApiError {
  response?: {
    status?: number;
    data?: { message?: string; code?: string; duplicate?: boolean; mode_lock?: boolean; existing_emission?: { total_emission?: number | string; status?: string } };
  };
  message?: string;
}

type SavedBody = { emission?: { pk_id?: number; status?: string }; warnings?: Array<{ code?: string; message?: string }> } | undefined;

/** The engine's warning messages from a save answer (S3-4: FACTOR_FALLBACK_YEAR, FERA_FACTOR_MISSING). */
export const warningsOf = (body: SavedBody): string[] =>
  (body?.warnings ?? []).map((w) => w?.message ?? "").filter((m): m is string => m.length > 0);

/** Save one row. A 409 duplicate or mode-lock conflict comes back as an outcome, not a throw. */
export async function saveRow(payload: EmissionPayload, onDuplicate?: "replace" | "keep_both"): Promise<SaveOutcome> {
  try {
    const result = (await createEmission(payload, onDuplicate)) as SavedBody;
    return { kind: "saved", emissionId: result?.emission?.pk_id ?? null, warnings: warningsOf(result), status: result?.emission?.status ?? null };
  } catch (err) {
    const e = err as ApiError;
    const data = e.response?.data;
    if (e.response?.status === 409 && data?.duplicate) {
      const existing = data.existing_emission;
      return {
        kind: "duplicate",
        message: data.message ?? "An entry for this already exists in the period.",
        existing: existing ? { tco2e: existing.total_emission == null ? null : Number(existing.total_emission), status: existing.status ?? null } : null,
      };
    }
    return {
      kind: "error",
      modeLock: !!data?.mode_lock,
      ...(data?.code === "METHOD_NOT_ALLOWED" ? { methodNotAllowed: true } : {}),
      message: data?.message ?? e.message ?? "Couldn't save this row. Try again.",
    };
  }
}

/**
 * The site's country (ISO alpha-2) for the data quality preview (S3-3: a factor
 * for the site's own country scores best). Null when unknown; the preview then
 * scores geography as the engine would without one.
 */
export function useSiteCountry(siteId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["add-data", "site-country", siteId],
    enabled: enabled && siteId !== null,
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const site = (await getSiteById(siteId as number).catch(() => null)) as { country?: { code?: unknown } | null } | null;
      const code = site?.country?.code;
      return typeof code === "string" && code.trim() ? code.trim().toUpperCase() : null;
    },
  });
}

/** Attach files picked on a typed row to its saved entry. True when they were all stored. */
export async function uploadRowEvidence(emissionId: number, files: File[]): Promise<boolean> {
  try {
    const result = await uploadMultipleDocuments({ files, emission_id: emissionId, document_type: "other" });
    return (result.documents?.length ?? 0) === files.length;
  } catch {
    return false;
  }
}

/**
 * Save changes to an entry loaded from "Already entered" (pending, rejected,
 * or a draft); the backend sets it back to pending, or to draft with the
 * review workflow on (S3-15).
 */
export async function updateRow(id: number, payload: EmissionPayload): Promise<SaveOutcome> {
  try {
    const result = (await updateEmission(id, {
      activity_data: payload.activity_data,
      extra_data: payload.extra_data,
      date_of_reporting: payload.date_of_reporting,
      activity_data_unit: payload.activity_data_unit,
    })) as SavedBody;
    return { kind: "saved", emissionId: result?.emission?.pk_id ?? id, warnings: warningsOf(result), status: result?.emission?.status ?? null };
  } catch (err) {
    const e = err as ApiError;
    return { kind: "error", modeLock: false, message: e.response?.data?.message ?? e.message ?? "Couldn't save this row. Try again." };
  }
}

/** Entries already saved for site × category × period (the user's own; the list endpoint scopes by role). */
export function useExistingEntries(siteId: number | null, categoryId: number | null, period: EntryPeriod | null) {
  return useQuery({
    queryKey: ["add-data", "existing", siteId, categoryId, period],
    enabled: siteId !== null && categoryId !== null && period !== null,
    queryFn: async () => {
      const q = entriesQuery(period as EntryPeriod);
      const result = await getEmissionsPaginated({ siteIds: [siteId as number], categoryId, year: q.year, month: q.month, page: 1, limit: 100 });
      const entries = (result.data as unknown as SavedEntry[]).filter((e) => entryInPeriod(e, period as EntryPeriod));
      // More than one page: the list says so instead of showing a short count.
      return { entries, more: result.total > result.data.length };
    },
  });
}

/** F-13/F-27: the save's mode lock for the chosen period, before typing ("already filed monthly for CY 2025 (57 …)"). */
export function usePeriodMode(siteId: number | null, categoryId: number | null, period: EntryPeriod | null) {
  return useQuery({
    queryKey: ["add-data", "period-mode", siteId, categoryId, period],
    enabled: siteId !== null && categoryId !== null && period !== null,
    queryFn: () => {
      const p = period as EntryPeriod;
      return getPeriodMode(siteId as number, categoryId as number, {
        reporting_period: p.mode,
        ...(p.mode === "yearly" ? { year_type: p.yearType } : {}),
        date_of_reporting: entryDate(p),
      });
    },
  });
}

export type { ExtractionResponse, Invoice };

type BillContext = { siteId: number; categoryId: number; userId: number | null; units: string[] };

// A contributor sees the service's words only when they are plain ones; a server-side
// detail ("tesseract is not installed…") becomes "We couldn't read this bill…" (F-01).
const aiError = (err: unknown, fallback: string) => {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e.response?.data?.detail;
  return billErrorMessage(typeof detail === "string" ? detail : e.message, fallback);
};

/**
 * Upload one bill to the AI service and read it. The service stores the file
 * (an invoice row) and returns the entries it found. Throws a readable message.
 */
export async function readBill(file: File, ctx: BillContext): Promise<ExtractionResponse> {
  try {
    const response = await uploadAndExtractInvoice({
      file,
      site_id: ctx.siteId,
      category_id: ctx.categoryId,
      uploaded_by: ctx.userId ?? undefined,
      unit_names: ctx.units.length ? ctx.units : undefined,
    });
    if (response.error && !response.emission?.length) throw new Error(response.error);
    return response;
  } catch (err) {
    throw new Error(aiError(err, BILL_UNREADABLE));
  }
}

/** Read a bill uploaded earlier again, for this site and category. */
export async function rereadBill(invoiceId: number, ctx: BillContext): Promise<ExtractionResponse> {
  try {
    const response = await reextractInvoice(invoiceId, { site_id: ctx.siteId, category_id: ctx.categoryId, unit_names: ctx.units });
    if (response.error && !response.emission?.length) throw new Error(response.error);
    return response;
  } catch (err) {
    throw new Error(aiError(err, BILL_UNREADABLE));
  }
}

/** Bills uploaded for this site and category ("My bills"). */
export function useBills(siteId: number | null, categoryId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["add-data", "bills", siteId, categoryId],
    enabled: enabled && siteId !== null && categoryId !== null,
    queryFn: () => getInvoices({ site_id: siteId as number, category_id: categoryId as number }),
  });
}

export function useDeleteBill() {
  const client = useQueryClient();
  return useMutation({
    // data-loss-reviewed: deletes one bill's uploads (every re-upload of the same file, F-02) after the user confirms; files still linked as evidence are kept by the AI service
    mutationFn: async (invoiceIds: number[]): Promise<void> => {
      await (invoiceIds.length === 1 ? deleteInvoice(invoiceIds[0]) : bulkDeleteInvoices(invoiceIds));
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["add-data", "bills"] }),
  });
}

/** Per row: the saved entries of the period that its bill or files already back (F-16). */
export type AlreadyBacking = Map<number, { fileName: string; entries: BackedEntry[] }[]>;

/**
 * F-16: before sending, which rows' bill or files already back another entry of the same site,
 * category and period (the same bill under two disposal methods). A warning; nothing blocks.
 * Entries being edited don't count; off once a send starts, so the rows never match themselves.
 */
export function useAlreadyBacking(rows: ModalRow[], payloads: EmissionPayload[], filesOf: (rowId: number) => File[], enabled: boolean): AlreadyBacking {
  type Body = Parameters<typeof findBackedEntries>[0] & { exclude_ids: number[] };
  const byDate = new Map<string, Body>();
  rows.forEach((row, i) => {
    const payload = payloads[i];
    if (!payload) return;
    const bill = billOf(row);
    const files = bill ? [] : filesOf(row.id);
    const items = [
      ...(bill?.invoiceId != null ? [{ ref: String(row.id), invoice_id: bill.invoiceId }] : []),
      ...files.map((f, k) => ({ ref: `${row.id}:${k}`, file_name: f.name, file_size: f.size })),
    ];
    if (items.length === 0) return;
    const date = String(payload.date_of_reporting).slice(0, 10);
    const body = byDate.get(date) ?? { site_id: payload.site_id, category_id: payload.category_id, date_of_reporting: date, files: [], exclude_ids: [] };
    body.files.push(...items);
    const editing = editOf(row);
    if (editing !== null) body.exclude_ids.push(editing);
    byDate.set(date, body);
  });
  const results = useQueries({
    queries: [...byDate.values()].map((body) => ({
      queryKey: ["add-data", "already-backing", body],
      queryFn: () => findBackedEntries(body),
      enabled,
      staleTime: 30_000,
    })),
  });
  const out: AlreadyBacking = new Map();
  for (const r of results) {
    for (const match of r.data ?? []) {
      const rowId = Number(match.ref.split(":")[0]);
      out.set(rowId, [...(out.get(rowId) ?? []), { fileName: match.file_name ?? "", entries: match.entries }]);
    }
  }
  return out;
}

/** Attach a bill as evidence to the rows saved from it (B8). Resolves to false when that failed. */
export async function linkBillEvidence(invoiceId: number, emissionIds: number[]): Promise<boolean> {
  try {
    await linkInvoiceDocuments(invoiceId, emissionIds);
    return true;
  } catch {
    return false;
  }
}

export type { ResolvedLocation } from "../../services/locationService";

/** Look a typed or pasted address up on the backend (Google geocoding). */
export const resolveLocation = (query: string) => resolveLocationFromBackend(query);

export type RouteResult = { meters: number; durationText: string | null; polyline: string | null; seaPath: [number, number][] | null };

const pointOf = (p: ResolvedLocation) => ({ address: p.display_name, lat: p.lat, lng: p.lon, placeId: p.place_id || undefined });

/** Road or sea route between two places (backend routing; sea uses the AI service's sea-route). */
export function useRoute(mode: "road" | "sea" | null, from: ResolvedLocation | null, to: ResolvedLocation | null) {
  return useQuery({
    queryKey: ["add-data", "route", mode, from?.lat, from?.lon, to?.lat, to?.lon],
    enabled: mode !== null && !!from && !!to,
    retry: false,
    staleTime: Infinity,
    queryFn: async (): Promise<RouteResult> => {
      const body = { origin: pointOf(from as ResolvedLocation), destination: pointOf(to as ResolvedLocation) };
      if (mode === "sea") {
        const r = await calculateSeaDistance({ ...body, mode: "sea" });
        const coords = (r.seaGeometry as { coordinates?: unknown[] } | null)?.coordinates ?? [];
        const seaPath = coords.filter((c): c is [number, number] => Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number");
        return { meters: r.distanceMeters, durationText: r.durationText, polyline: null, seaPath: seaPath.length ? seaPath : null };
      }
      const r = await calculateRoadDistance({ ...body, mode: "road" });
      return { meters: r.distanceMeters, durationText: r.durationText, polyline: r.encodedPolyline, seaPath: null };
    },
  });
}

// S3-6: suppliers for the Supplier field on Category 1 and 2 rows. Reads are
// open to everyone with access to the company; adding one is Manager and above.
const supplierKeys = {
  list: (year: number) => ["add-data", "suppliers", year] as const,
  detail: (id: number) => ["add-data", "supplier", id] as const,
};

export function useSupplierOptions(year: number, enabled: boolean) {
  return useQuery({ queryKey: supplierKeys.list(year), queryFn: () => getSuppliers(null, year), enabled, staleTime: 60_000 });
}

/** The figures and facility data of every supplier the rows name, loaded once each. */
export function useSupplierDetails(ids: number[]): Map<number, SupplierDetail> {
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  const results = useQueries({
    queries: unique.map((id) => ({ queryKey: supplierKeys.detail(id), queryFn: () => getSupplier(null, id), staleTime: 60_000 })),
  });
  const map = new Map<number, SupplierDetail>();
  results.forEach((r, i) => {
    if (r.data) map.set(unique[i], r.data);
  });
  return map;
}

export function useCreateSupplier(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createSupplier(null, { name }),
    onSettled: () => qc.invalidateQueries({ queryKey: supplierKeys.list(year) }),
  });
}

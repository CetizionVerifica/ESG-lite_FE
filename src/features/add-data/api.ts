import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { getUserColumnConfigsBySiteAndCategory } from "../../services/columnConfigService";
import { getUserEmissionFactorsBySiteAndCategory } from "../../services/emissionFactorService";
import { getUserUnitsBySiteAndCategory, type UnitData } from "../../services/unitService";
import { getMappingsByCompany, type CategoryMapping } from "../../services/categoryMappingService";

export type { CategoryMapping };
import { createEmission, getPeriodTotal } from "../../services/emissionService";
import { getThresholdByCompany } from "../../services/thresholdService";
import { linkInvoiceDocuments } from "../../services/documentService";
import {
  deleteInvoice,
  getInvoices,
  reextractInvoice,
  uploadAndExtractInvoice,
  type ExtractionResponse,
  type Invoice,
} from "../../services/invoiceService";
import { periodTotalQuery, previousPeriod, type EmissionPayload, type EntryPeriod } from "./logic/entry";
import type { ColumnConfig, EmissionFactor } from "./types";

/** Everything the form needs for one site × category × factor year. */
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
    queryKey: ["add-data", "setup", siteId, categoryId, factorYear, companyId, feraCategoryId],
    enabled: siteId !== null && categoryId !== null && factorYear !== null,
    queryFn: async (): Promise<EntrySetup> => {
      const site = siteId as number;
      const category = categoryId as number;
      const [configs, factors, units, mappings, fera] = await Promise.all([
        getUserColumnConfigsBySiteAndCategory(site, category) as Promise<ColumnConfig[]>,
        getUserEmissionFactorsBySiteAndCategory(site, category, factorYear as number) as Promise<EmissionFactor[]>,
        getUserUnitsBySiteAndCategory(site, category) as Promise<UnitData[]>,
        // Optional extras: the form still works without them.
        companyId ? getMappingsByCompany(companyId, site, category).catch(() => []) : Promise.resolve([]),
        feraCategoryId
          ? Promise.all([
              getUserEmissionFactorsBySiteAndCategory(site, feraCategoryId, factorYear as number).catch(() => []),
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
  | { kind: "saved"; emissionId: number | null }
  | { kind: "duplicate"; message: string }
  | { kind: "error"; message: string; modeLock: boolean };

interface ApiError {
  response?: { status?: number; data?: { message?: string; duplicate?: boolean; mode_lock?: boolean } };
  message?: string;
}

/** Save one row. A 409 duplicate or mode-lock conflict comes back as an outcome, not a throw. */
export async function saveRow(payload: EmissionPayload, replace = false): Promise<SaveOutcome> {
  try {
    const result = (await createEmission(payload, replace)) as { emission?: { pk_id?: number } } | undefined;
    return { kind: "saved", emissionId: result?.emission?.pk_id ?? null };
  } catch (err) {
    const e = err as ApiError;
    const data = e.response?.data;
    if (e.response?.status === 409 && data?.duplicate) {
      return { kind: "duplicate", message: data.message ?? "An entry for this already exists in the period." };
    }
    return {
      kind: "error",
      modeLock: !!data?.mode_lock,
      message: data?.message ?? e.message ?? "Couldn't save this row. Try again.",
    };
  }
}

export type { ExtractionResponse, Invoice };

type BillContext = { siteId: number; categoryId: number; userId: number | null; units: string[] };

const aiError = (err: unknown, fallback: string) => {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e.response?.data?.detail;
  return typeof detail === "string" ? detail : e.message || fallback;
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
    throw new Error(aiError(err, "Couldn't read this bill."));
  }
}

/** Read a bill uploaded earlier again, for this site and category. */
export async function rereadBill(invoiceId: number, ctx: BillContext): Promise<ExtractionResponse> {
  try {
    const response = await reextractInvoice(invoiceId, { site_id: ctx.siteId, category_id: ctx.categoryId, unit_names: ctx.units });
    if (response.error && !response.emission?.length) throw new Error(response.error);
    return response;
  } catch (err) {
    throw new Error(aiError(err, "Couldn't read this bill again."));
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
    // data-loss-reviewed: deletes one uploaded bill after the user confirms; files still linked as evidence are kept by the AI service
    mutationFn: (invoiceId: number) => deleteInvoice(invoiceId),
    onSuccess: () => client.invalidateQueries({ queryKey: ["add-data", "bills"] }),
  });
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

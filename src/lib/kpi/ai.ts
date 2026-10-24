// KPI-12 · AI assist, suggest only (layers/python_AI_service-kpi): readers
// for the two answers and the plain rules the chips follow. A person
// confirms every suggestion; nothing here saves or converts a value.
import { FRAMEWORK_CODES, type FrameworkCode, type KpiMappingSuggestion, type KpiValueSuggestion } from "./contracts";

/** Below this a value chip reads "Check this" (layer rule 4). */
export const VALUE_CHECK_BELOW = 0.6;
/** At or below this a mapping suggestion reads "Check this" (backend, wave D). */
export const MAPPING_CHECK_AT_OR_BELOW = 0.5;

export const AI_DOWN_MESSAGE = "AI not available right now. You can still enter everything yourself.";

type Loose = Record<string, unknown>;
const obj = (v: unknown): Loose => (v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const confidenceOf = (v: unknown): number => {
  const n = numOrNull(v) ?? 0;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
};

export interface ValueSuggestions {
  available: boolean;
  /** The server's words when AI is down. */
  message: string | null;
  documentId: number | null;
  documentName: string | null;
  suggestions: KpiValueSuggestion[];
}

/**
 * `POST /kpi/ai/suggest-values` read tolerantly: `{document_id, document_name,
 * pages, suggestions}` or `{available:false, message}`; also the KPI-0 mock's
 * `{kpi, period}` names.
 */
export function readValueSuggestions(data: unknown, fallbackName: string | null = null): ValueSuggestions {
  const root = obj(data);
  if (root.available === false) return { available: false, message: str(root.message), documentId: null, documentName: null, suggestions: [] };
  const list = Array.isArray(root.suggestions) ? root.suggestions : [];
  const suggestions = list
    .map(obj)
    .map((s): KpiValueSuggestion | null => {
      const code = str(s.kpi_code) ?? str(s.kpi) ?? str(s.code);
      const value = typeof s.value === "number" || typeof s.value === "string" ? s.value : null;
      if (!code || value === null || value === "") return null;
      const period = str(s.period);
      return {
        kpi_code: code,
        kpi_definition_id: numOrNull(s.kpi_definition_id),
        value,
        unit: str(s.unit),
        breakdown_key: str(s.breakdown_key),
        period_start: str(s.period_start) ?? (period && /^\d{4}-\d{2}$/.test(period) ? `${period}-01` : period),
        period_end: str(s.period_end),
        site_hint: str(s.site_hint),
        source_page: numOrNull(s.source_page),
        quote: str(s.quote),
        confidence: confidenceOf(s.confidence),
        why: str(s.why),
      };
    })
    .filter((s): s is KpiValueSuggestion => !!s);
  return { available: true, message: null, documentId: numOrNull(root.document_id), documentName: str(root.document_name) ?? fallbackName, suggestions };
}

export interface MappingSuggestions {
  available: boolean;
  message: string | null;
  suggestions: KpiMappingSuggestion[];
}

/** `POST /kpi/ai/suggest-mapping` read tolerantly; the disclosure id is found by framework and code when it isn't sent. */
export function readMappingSuggestions(data: unknown, findDisclosure: (framework: FrameworkCode, code: string) => number | undefined): MappingSuggestions {
  const root = obj(data);
  if (root.available === false) return { available: false, message: str(root.message), suggestions: [] };
  const list = Array.isArray(root.suggestions) ? root.suggestions : [];
  const suggestions = list
    .map(obj)
    .map((s): KpiMappingSuggestion | null => {
      const framework = String(s.framework ?? "").toUpperCase() as FrameworkCode;
      const code = str(s.code);
      if (!(FRAMEWORK_CODES as readonly string[]).includes(framework) || !code) return null;
      const id = numOrNull(s.disclosure_id) ?? findDisclosure(framework, code);
      if (id === undefined || id === null) return null;
      const fit = s.fit === "exact" || s.fit === "partial" || s.fit === "derived" ? s.fit : undefined;
      return { disclosure_id: id, framework, code, title: str(s.title), section: str(s.section), why: str(s.why), confidence: confidenceOf(s.confidence), ...(fit ? { fit } : {}) };
    })
    .filter((s): s is KpiMappingSuggestion => !!s);
  return { available: true, message: null, suggestions };
}

/** True when a value chip should read "Check this". */
export const checkValue = (s: Pick<KpiValueSuggestion, "confidence">) => s.confidence < VALUE_CHECK_BELOW;
/** True when a mapping suggestion should read "Check this". */
export const checkMapping = (s: Pick<KpiMappingSuggestion, "confidence">) => s.confidence <= MAPPING_CHECK_AT_OR_BELOW;

/** "Suggested from water-bill.pdf, page 2" */
export function sourceLine(documentName: string | null, page: number | null): string {
  const doc = documentName ? `Suggested from ${documentName}` : "Suggested from your document";
  return page ? `${doc}, page ${page}` : doc;
}

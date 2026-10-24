// DS-12 · POST /studio/docs/:id/checks and the runner that keeps the editor's
// checks current: after an edit has been autosaved (2.5 s after the last
// change), or when asked (Refresh, a fix, the final dialog). The live
// measurements of the mounted sheets go along, so layout checks show at once;
// the server always recomputes the rest from the saved draft.
import { useEffect, useRef } from "react";
import api from "../../../api/axios";
import type { ChecksBody, ChecksResponse, CheckMeasurement, ReportDoc } from "../../../lib/studio/contracts";
import { measureSheet } from "../../../lib/studio/renderHost";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { sheetRoot } from "../editor/canvasUtil";
import { currentRev, dsError } from "../share/api";
import { getChecksState, setChecksState, useChecksState } from "./store";

/** Wait after the last edit before asking (autosave runs 1 s after idle). */
export const CHECKS_DEBOUNCE_MS = 2500;

export async function postChecks(docId: number, body: ChecksBody, companyId: number | null): Promise<ChecksResponse> {
  const { data } = await api.post<ChecksResponse>(`/studio/docs/${docId}/checks`, companyId ? { ...body, company_id: companyId } : body, { params: companyId ? { company_id: companyId } : undefined });
  if (!data || !Array.isArray(data.checks)) throw new Error("The checks answered in a shape this page doesn't know.");
  return { ...data, warnings: Array.isArray(data.warnings) ? data.warnings : [], blocking: !!data.blocking };
}

/** Measurements of every mounted free-form sheet of the doc (the editor's live view). */
export function liveMeasurements(doc: ReportDoc): CheckMeasurement[] | undefined {
  const out: CheckMeasurement[] = [];
  for (const p of doc.pages) {
    if (p.kind !== "freeform") continue;
    const root = sheetRoot(p.id);
    if (!root) continue;
    try {
      out.push(...(measureSheet(root) as CheckMeasurement[]));
    } catch {
      // A sheet that can't be measured (jsdom, unmounted) just doesn't count.
    }
  }
  return out.length ? out : undefined;
}

/** Runs the checks for the saved rev; one retry when the rev moved meanwhile. */
export async function runChecks(docId: number, doc: ReportDoc | null, companyId: number | null): Promise<ChecksResponse> {
  const measurements = doc ? liveMeasurements(doc) : undefined;
  let rev = await currentRev(docId, companyId);
  try {
    return await postChecks(docId, { rev, ...(measurements ? { measurements } : {}) }, companyId);
  } catch (err) {
    const e = dsError(err);
    const next = (e.details as { rev?: number } | undefined)?.rev;
    if (e.code !== "DS_VERSION_CONFLICT" || typeof next !== "number") throw err;
    rev = next;
    return postChecks(docId, { rev, ...(measurements ? { measurements } : {}) }, companyId);
  }
}

/** Keeps the doc's checks in the store current (mounted once, by the top bar's counter). */
export function useChecksRunner(docId: number, doc: ReportDoc, enabled = true): void {
  const companyId = useStudioCompanyId();
  const { refresh } = useChecksState(docId);
  const seq = useRef(0);
  const latestDoc = useRef(doc);
  latestDoc.current = doc;

  useEffect(() => {
    if (!enabled || docId <= 0) return;
    const run = async () => {
      const mine = ++seq.current;
      setChecksState(docId, { loading: true });
      try {
        const data = await runChecks(docId, latestDoc.current, companyId);
        if (mine === seq.current) setChecksState(docId, { data, loading: false, error: null });
      } catch (err) {
        if (mine !== seq.current) return;
        const e = dsError(err);
        setChecksState(docId, { loading: false, error: e.message ?? (err as Error)?.message ?? "The checks couldn't run. Try again." });
      }
    };
    const t = window.setTimeout(() => void run(), getChecksState(docId).data ? CHECKS_DEBOUNCE_MS : 300);
    return () => window.clearTimeout(t);
  }, [docId, doc, enabled, companyId, refresh]);
}

/** Runs the checks once now (the final form outside the editor: Page view, Preview) and stores them. */
export function useChecksOnce(docId: number, enabled = true): void {
  const companyId = useStudioCompanyId();
  const { refresh } = useChecksState(docId);
  useEffect(() => {
    if (!enabled || docId <= 0) return;
    let live = true;
    setChecksState(docId, { loading: true });
    runChecks(docId, null, companyId).then(
      (data) => live && setChecksState(docId, { data, loading: false, error: null }),
      (err) => live && setChecksState(docId, { loading: false, error: dsError(err).message ?? "The checks couldn't run. Try again." }),
    );
    return () => {
      live = false;
    };
  }, [docId, enabled, companyId, refresh]);
}

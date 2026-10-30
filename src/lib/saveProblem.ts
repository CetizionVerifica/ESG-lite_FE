/**
 * How the app shows a refused save. The server marks refusals that aren't a
 * mistake in what the person typed with `severity: "warning"`: someone else
 * changed or reviewed the entry meanwhile (ENTRY_CHANGED), the new date already
 * holds the same activity, or the period is filed the other way. Those show as
 * a warning, not an error. ENTRY_CHANGED (and ENTRY_APPROVED: it was approved
 * meanwhile) also ends the edit: saving again would overwrite the other
 * person's change, so the form hides its Save button. A duplicate (`duplicate:
 * true`) can be saved anyway as a separate bill: the form offers Keep both,
 * which sends the edit again with keep_both.
 */
export type SaveProblem = { message: string; warning: boolean; stopEdit: boolean; duplicate: boolean };

export function saveProblem(err: unknown, fallback: string): SaveProblem {
  const data = (err as { response?: { data?: { message?: unknown; severity?: unknown; code?: unknown; duplicate?: unknown } } })?.response?.data;
  const message = typeof data?.message === "string" && data.message ? data.message : fallback;
  return {
    message,
    warning: data?.severity === "warning",
    stopEdit: data?.code === "ENTRY_CHANGED" || data?.code === "ENTRY_APPROVED",
    duplicate: data?.duplicate === true,
  };
}

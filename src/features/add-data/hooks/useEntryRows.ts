import { useCallback, useEffect, useReducer, useRef } from "react";
import { billOf, markEdited } from "../logic/bill";
import { withCompositeProduct } from "../logic/distance";
import { applyChange, newRow, setExtraField, type FormModel } from "../logic/form";
import { ROW_METHOD_COLUMN } from "../../../lib/emissions/emissionCalc";
import type { ModalRow } from "../types";

// One reducer for the rows being entered (replaces the legacy page's modal
// row state). The draft is kept in sessionStorage per user × site × category
// × period (key from `lib/entryDrafts`, cleared on sign-out), so a reload or a
// detour doesn't lose typed rows.

/**
 * `key` is the draft key the rows were started or restored for; null when none is open.
 * `sent`: every row was sent or skipped. They stay for the success screen, are never
 * saved as a draft again, and any later change starts from an empty list.
 */
type State = { rows: ModalRow[]; nextId: number; key: string | null; sent: boolean };
/**
 * Sent only by the hook itself: start or restore rows for `key`, drop a closed
 * context's rows (its draft stays in storage), or mark the rows as sent.
 */
type ContextAction = { type: "reset"; rows: ModalRow[]; key: string } | { type: "forget" } | { type: "sent" };
type Action =
  | ContextAction
  | { type: "add"; model: FormModel }
  | { type: "duplicate"; id: number }
  | { type: "remove"; id: number }
  | { type: "change"; model: FormModel; id: number; column: string; value: string }
  /** A distance from the distance helper; `estimate` marks the column's value as estimated (saved as `is_estimate`, S3-3). */
  | { type: "distance"; model: FormModel; id: number; column: string; value: string; estimate: boolean }
  | { type: "extra"; id: number; key: string; value: string }
  /** Rows read from a bill; dropped when `draftKey` is no longer the open context. */
  | { type: "append"; rows: ModalRow[]; draftKey: string | null }
  | { type: "confirmBill"; key: string }
  | { type: "removeBill"; key: string }
  /** A saved entry loaded back to fix or change; replaces an empty typed row and any earlier copy of it. */
  | { type: "load"; row: ModalRow };

const nextIdOf = (rows: ModalRow[]) => rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;

/** A person's edit: the field, and any value it changes in turn, stops being AI-filled. */
export function editRow(model: FormModel, row: ModalRow, column: string, value: string): ModalRow {
  // A count or distance of a composite unit (passenger × km) also sets the column to their product.
  let next = withCompositeProduct(applyChange(model, markEdited(row, column), column, value), column);
  // A value typed over an estimated distance is the person's own figure, not an estimate any more.
  next = withEstimate(next, column, false);
  // Values the edit changed too (cleared children, a re-derived category) aren't the AI's any more.
  for (const field of billOf(next)?.ai ?? []) if (next[field] !== row[field]) next = markEdited(next, field);
  return next;
}

/** Columns whose value came from an estimate (S3-3 `is_estimate`); kept in the private `_estimates`. */
export function withEstimate(row: ModalRow, column: string, estimate: boolean): ModalRow {
  const list: string[] = Array.isArray(row._estimates) ? row._estimates : [];
  if (estimate === list.includes(column)) return row;
  const next = { ...row, _estimates: estimate ? [...list, column] : list.filter((c) => c !== column) };
  if (next._estimates.length === 0) delete (next as Partial<ModalRow>)._estimates;
  return next;
}

/** True when any value on the row is an estimate (saved as `is_estimate`). */
export const isEstimated = (row: ModalRow) => Array.isArray(row._estimates) && row._estimates.length > 0;

export function rowsReducer(prev: State, action: Action): State {
  // Rows already sent never come back into editing: a later change starts from an
  // empty list. Ids keep counting, so a new row never takes a sent row's evidence files.
  const state = prev.sent && action.type !== "reset" && action.type !== "forget" && action.type !== "sent" ? { ...prev, rows: [], sent: false } : prev;
  switch (action.type) {
    case "reset":
      return { rows: action.rows, nextId: nextIdOf(action.rows), key: action.key, sent: false };
    case "forget":
      return { rows: [], nextId: 1, key: null, sent: false };
    case "sent":
      return state.sent ? state : { ...state, sent: true };
    case "add":
      return { ...state, rows: [...state.rows, newRow(action.model, state.nextId)], nextId: state.nextId + 1 };
    case "duplicate": {
      const i = state.rows.findIndex((r) => r.id === action.id);
      if (i < 0) return state;
      // A copy is a new entry: it doesn't edit the saved entry the original was loaded from.
      const source = { ...state.rows[i] };
      delete source._editOf;
      delete source._editSaved;
      const copy = { ...source, id: state.nextId, _extra_data: { ...(source._extra_data ?? {}) } };
      return { ...state, rows: [...state.rows.slice(0, i + 1), copy, ...state.rows.slice(i + 1)], nextId: state.nextId + 1 };
    }
    case "remove":
      return { ...state, rows: state.rows.filter((r) => r.id !== action.id) };
    case "change":
      return {
        ...state,
        rows: state.rows.map((r) => (r.id === action.id ? editRow(action.model, r, action.column, action.value) : r)),
      };
    case "distance":
      return {
        ...state,
        rows: state.rows.map((r) => (r.id === action.id ? withEstimate(editRow(action.model, r, action.column, action.value), action.column, action.estimate) : r)),
      };
    case "extra":
      return { ...state, rows: state.rows.map((r) => (r.id === action.id ? setExtraField(r, action.key, action.value) : r)) };
    case "append": {
      // Ids are renumbered from nextId so rows read earlier never collide.
      const added = action.rows.map((r, i) => ({ ...r, id: state.nextId + i }));
      return { ...state, rows: [...state.rows, ...added], nextId: state.nextId + added.length };
    }
    case "confirmBill":
      return {
        ...state,
        rows: state.rows.map((r) => {
          const bill = billOf(r);
          return bill?.key === action.key ? { ...r, _bill: { ...bill, confirmed: true } } : r;
        }),
      };
    case "removeBill":
      return { ...state, rows: state.rows.filter((r) => billOf(r)?.key !== action.key) };
    case "load": {
      const kept = state.rows.filter((r) => (billOf(r) || rowHasInput(r)) && (r._editOf == null || r._editOf !== action.row._editOf));
      return { ...state, rows: [...kept, { ...action.row, id: state.nextId }], nextId: state.nextId + 1 };
    }
  }
}

function readDraft(key: string): ModalRow[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    const rows = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(rows) && rows.length > 0 ? (rows as ModalRow[]) : null;
  } catch {
    return null;
  }
}

/**
 * True when a row holds anything the user typed. The row's method alone isn't
 * input: a new row starts on the form's default method (S3-3).
 */
export const rowHasInput = (row: ModalRow) =>
  Object.entries(row).some(([k, v]) =>
    k === "_extra_data" ? Object.values(v ?? {}).some(Boolean) : k !== "id" && k !== ROW_METHOD_COLUMN && !k.startsWith("_") && !!v,
  );

export function useEntryRows(model: FormModel | null, draftKey: string | null) {
  const [state, dispatch] = useReducer(rowsReducer, { rows: [], nextId: 1, key: null, sent: false });

  // When the open context changes, start (or restore) its rows once its form
  // has arrived; until then, forget the previous context's rows, which live on
  // in their own draft. A refetched form for the same context keeps the rows.
  useEffect(() => {
    if (state.key === draftKey) return;
    if (model && draftKey) dispatch({ type: "reset", rows: readDraft(draftKey) ?? [newRow(model, 1)], key: draftKey });
    else if (state.key !== null) dispatch({ type: "forget" });
  }, [model, draftKey, state.key]);

  // Save only rows that belong to this context. Before the form arrives the
  // rows are still empty (or the previous context's), and acting on them would
  // delete the stored draft before it is restored, or file the old rows under
  // the new key.
  useEffect(() => {
    if (!draftKey || state.key !== draftKey || state.sent) return;
    try {
      if (state.rows.some(rowHasInput)) sessionStorage.setItem(draftKey, JSON.stringify(state.rows));
      else sessionStorage.removeItem(draftKey);
    } catch {
      // Storage full or blocked: the draft is a convenience only.
    }
  }, [state.rows, state.key, state.sent, draftKey]);

  const clearDraft = useCallback(() => {
    if (!draftKey) return;
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  }, [draftKey]);

  /** Every row was sent or skipped: clear the draft and keep the rows only for the success screen. */
  const markSent = useCallback(() => {
    clearDraft();
    dispatch({ type: "sent" });
  }, [clearDraft]);

  // A bill read finishing after the site, category or period changed must not
  // land in the new context's rows.
  const keyRef = useRef(draftKey);
  keyRef.current = draftKey;
  const guarded = useCallback((action: Exclude<Action, ContextAction>) => {
    if (action.type === "append" && action.draftKey !== keyRef.current) return;
    dispatch(action);
  }, []);

  // Rows of another context are never handed out (they'd show in the unsaved
  // guard or the period comparison while the new form loads).
  const own = state.key === draftKey;
  return { rows: own ? state.rows : NO_ROWS, sent: own && state.sent, dispatch: guarded, clearDraft, markSent };
}

const NO_ROWS: ModalRow[] = [];

export type RowsDispatch = ReturnType<typeof useEntryRows>["dispatch"];

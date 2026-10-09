import { useCallback, useEffect, useReducer } from "react";
import { billOf, markEdited } from "../logic/bill";
import { applyChange, newRow, setExtraField, type FormModel } from "../logic/form";
import type { ModalRow } from "../types";

// One reducer for the rows being entered (replaces the legacy page's modal
// row state). The draft is kept in sessionStorage per site × category ×
// period, so a reload or a detour doesn't lose typed rows.

type State = { rows: ModalRow[]; nextId: number };
type Action =
  | { type: "reset"; rows: ModalRow[] }
  | { type: "add"; model: FormModel }
  | { type: "duplicate"; id: number }
  | { type: "remove"; id: number }
  | { type: "change"; model: FormModel; id: number; column: string; value: string }
  | { type: "extra"; id: number; key: string; value: string }
  | { type: "append"; rows: ModalRow[] }
  | { type: "confirmBill"; key: string }
  | { type: "removeBill"; key: string };

const nextIdOf = (rows: ModalRow[]) => rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;

/** A person's edit: the field, and any value it changes in turn, stops being AI-filled. */
export function editRow(model: FormModel, row: ModalRow, column: string, value: string): ModalRow {
  let next = applyChange(model, markEdited(row, column), column, value);
  // Values the edit changed too (cleared children, a re-derived category) aren't the AI's any more.
  for (const field of billOf(next)?.ai ?? []) if (next[field] !== row[field]) next = markEdited(next, field);
  return next;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return { rows: action.rows, nextId: nextIdOf(action.rows) };
    case "add":
      return { rows: [...state.rows, newRow(action.model, state.nextId)], nextId: state.nextId + 1 };
    case "duplicate": {
      const i = state.rows.findIndex((r) => r.id === action.id);
      if (i < 0) return state;
      const copy = { ...state.rows[i], id: state.nextId, _extra_data: { ...(state.rows[i]._extra_data ?? {}) } };
      return { rows: [...state.rows.slice(0, i + 1), copy, ...state.rows.slice(i + 1)], nextId: state.nextId + 1 };
    }
    case "remove":
      return { ...state, rows: state.rows.filter((r) => r.id !== action.id) };
    case "change":
      return {
        ...state,
        rows: state.rows.map((r) => (r.id === action.id ? editRow(action.model, r, action.column, action.value) : r)),
      };
    case "extra":
      return { ...state, rows: state.rows.map((r) => (r.id === action.id ? setExtraField(r, action.key, action.value) : r)) };
    case "append": {
      // Ids are renumbered from nextId so rows read earlier never collide.
      const added = action.rows.map((r, i) => ({ ...r, id: state.nextId + i }));
      return { rows: [...state.rows, ...added], nextId: state.nextId + added.length };
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

/** True when a row holds anything the user typed. */
export const rowHasInput = (row: ModalRow) =>
  Object.entries(row).some(([k, v]) => (k === "_extra_data" ? Object.values(v ?? {}).some(Boolean) : k !== "id" && !k.startsWith("_") && !!v));

export function useEntryRows(model: FormModel | null, draftKey: string | null) {
  const [state, dispatch] = useReducer(reducer, { rows: [], nextId: 1 });

  // Start (or restore) the rows whenever the form for a new context arrives.
  useEffect(() => {
    if (!model || !draftKey) return;
    dispatch({ type: "reset", rows: readDraft(draftKey) ?? [newRow(model, 1)] });
  }, [model, draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    try {
      if (state.rows.some(rowHasInput)) sessionStorage.setItem(draftKey, JSON.stringify(state.rows));
      else sessionStorage.removeItem(draftKey);
    } catch {
      // Storage full or blocked: the draft is a convenience only.
    }
  }, [state.rows, draftKey]);

  const clearDraft = useCallback(() => {
    if (!draftKey) return;
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  }, [draftKey]);

  return { rows: state.rows, dispatch, clearDraft };
}

export type RowsDispatch = ReturnType<typeof useEntryRows>["dispatch"];

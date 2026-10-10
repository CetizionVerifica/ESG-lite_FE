import { type RefObject, useCallback, useEffect, useRef } from "react";
import { stepIndex } from "../review";

type Handlers = {
  onApprove: (id: number, index: number) => void;
  onReject: (id: number, index: number) => void;
  onToggle: (id: number) => void;
};

const TYPING = "input, textarea, select, [contenteditable='true'], [role='dialog']";

function rowsIn(container: HTMLElement | null): HTMLElement[] {
  return container ? [...container.querySelectorAll<HTMLElement>("tbody tr[data-row-id]")] : [];
}

/**
 * Approval-list keyboard (P07, P08): J/K move between rows, A approve, R reject, Space
 * select; Enter (open) comes from DataTable. Works while focus is on a row
 * or on nothing in particular (the page body), never while typing or in a
 * dialog.
 */
export function useRowKeys(container: RefObject<HTMLElement | null>, handlers: Handlers, enabled = true) {
  const h = useRef(handlers);
  h.current = handlers;

  /** Focuses the row at `index` (clamped) once the list has re-rendered. */
  const focusRow = useCallback(
    (index: number) => {
      requestAnimationFrame(() => {
        const rows = rowsIn(container.current);
        rows[Math.min(index, rows.length - 1)]?.focus();
      });
    },
    [container],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const root = container.current;
      if (!root || !target) return;
      const onPage = target === document.body || root.contains(target);
      if (!onPage || target.closest(TYPING)) return;

      const rows = rowsIn(root);
      const row = target.closest<HTMLElement>("tr[data-row-id]");
      const index = row ? rows.indexOf(row) : -1;
      const id = row ? Number(row.dataset.rowId) : NaN;
      const key = e.key.toLowerCase();

      if (key === "j" || key === "k") {
        e.preventDefault();
        rows[stepIndex(index, key === "j" ? 1 : -1, rows.length)]?.focus();
      } else if (Number.isFinite(id) && key === "a") {
        e.preventDefault();
        // A held key repeats; one press is one decision.
        if (!e.repeat) h.current.onApprove(id, index);
      } else if (Number.isFinite(id) && key === "r") {
        e.preventDefault();
        if (!e.repeat) h.current.onReject(id, index);
      } else if (Number.isFinite(id) && e.key === " " && target === row) {
        e.preventDefault();
        h.current.onToggle(id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [container, enabled]);

  return { focusRow };
}

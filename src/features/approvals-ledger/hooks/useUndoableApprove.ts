import { useCallback, useEffect, useRef, useState } from "react";
import type { EmissionStatus } from "../../../services/emissionService";

export const UNDO_MS = 8000;

/**
 * Approve with an undo window. The row shows as approved at once, but the
 * request is only sent when the window closes, so Undo leaves nothing behind
 * (no status flip, no audit entry). Leaving the page or closing the tab sends
 * whatever is still waiting.
 *
 * `optimistic` maps a row id to the status to show until the list refetches.
 */
export function useUndoableApprove({
  commit,
  onCommitted,
  onFailed,
  delay = UNDO_MS,
}: {
  commit: (id: number) => Promise<unknown>;
  onCommitted: () => void;
  onFailed: (id: number, error: unknown) => void;
  delay?: number;
}) {
  const [optimistic, setOptimistic] = useState<ReadonlyMap<number, EmissionStatus>>(() => new Map());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  // Latest callbacks, so timers fired after a re-render use current ones.
  const cb = useRef({ commit, onCommitted, onFailed });
  cb.current = { commit, onCommitted, onFailed };

  const setStatus = (id: number, status: EmissionStatus | null) =>
    setOptimistic((prev) => {
      const next = new Map(prev);
      if (status) next.set(id, status);
      else next.delete(id); // data-loss-reviewed: Map entry (UI state), not a record
      return next;
    });

  const send = useCallback((id: number) => {
    timers.current.delete(id); // data-loss-reviewed: Map entry (timer handle), not a record
    cb.current
      .commit(id)
      .then(() => cb.current.onCommitted())
      .catch((e: unknown) => {
        setStatus(id, null);
        cb.current.onFailed(id, e);
      });
  }, []);

  const approve = useCallback(
    (id: number) => {
      if (timers.current.has(id)) return;
      setStatus(id, "approved");
      timers.current.set(id, setTimeout(() => send(id), delay));
    },
    [delay, send],
  );

  const undo = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (!t) return false;
    clearTimeout(t);
    timers.current.delete(id); // data-loss-reviewed: Map entry (timer handle), not a record
    setStatus(id, null);
    return true;
  }, []);

  /** Sends every approval still in its undo window. */
  const flush = useCallback(() => {
    for (const [id, t] of [...timers.current]) {
      clearTimeout(t);
      send(id);
    }
  }, [send]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  /** Drops optimistic entries the server data now agrees with (or no longer lists). */
  const settle = useCallback((serverStatus: (id: number) => EmissionStatus | undefined) => {
    setOptimistic((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, status] of prev) {
        if (timers.current.has(id)) continue;
        const s = serverStatus(id);
        if (s === undefined || s === status) {
          next.delete(id); // data-loss-reviewed: Map entry (UI state), not a record
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  return { optimistic, approve, undo, flush, settle, waiting: (id: number) => timers.current.has(id) };
}

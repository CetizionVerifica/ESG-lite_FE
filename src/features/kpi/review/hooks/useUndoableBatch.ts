import { useCallback, useRef, useState } from "react";
import type { ReviewKpiValuesResult } from "../../../../lib/kpi/contracts";
import { useUndoableApprove } from "../../../../ui";

/**
 * KPI-8 · Approve with the 8 s undo window (05-ux S4), for one value or
 * "Approve all ready": the values leave the list at once, the request goes
 * when the window closes (or the page is left, as a keepalive request), and
 * Undo sends nothing. Each click is one window, keyed by a token.
 */
export function useUndoableBatch({
  commit,
  onDone,
  onFailed,
}: {
  commit: (ids: number[], opts: { keepalive?: boolean; onlyReady?: boolean }) => Promise<ReviewKpiValuesResult>;
  onDone: (result: ReviewKpiValuesResult) => Promise<unknown> | void;
  onFailed: (error: unknown) => void;
}) {
  const [waiting, setWaiting] = useState<ReadonlyMap<number, ReadonlySet<number>>>(() => new Map());
  const idsOf = useRef(new Map<number, { ids: number[]; onlyReady: boolean }>());
  const nextToken = useRef(1);
  const cb = useRef({ commit, onDone, onFailed });
  cb.current = { commit, onDone, onFailed };

  const drop = useCallback((token: number) => {
    idsOf.current.delete(token); // data-loss-reviewed: Map entry (UI state), not a record
    setWaiting((prev) => {
      if (!prev.has(token)) return prev;
      const next = new Map(prev);
      next.delete(token); // data-loss-reviewed: Map entry (UI state), not a record
      return next;
    });
  }, []);

  const undoable = useUndoableApprove<"approved">({
    commit: async (token, opts) => {
      const batch = idsOf.current.get(token);
      const result = await cb.current.commit(batch?.ids ?? [], { ...opts, onlyReady: batch?.onlyReady });
      try {
        await cb.current.onDone(result);
      } finally {
        drop(token);
      }
      return result;
    },
    onCommitted: () => undefined,
    onFailed: (token, e) => {
      drop(token);
      cb.current.onFailed(e);
    },
  });

  const start = useCallback(
    (ids: number[], opts: { onlyReady?: boolean } = {}) => {
      const token = nextToken.current++;
      idsOf.current.set(token, { ids, onlyReady: !!opts.onlyReady });
      setWaiting((prev) => new Map(prev).set(token, new Set(ids)));
      undoable.approve(token);
      return token;
    },
    [undoable],
  );

  const undo = useCallback(
    (token: number) => {
      if (!undoable.undo(token)) return false;
      drop(token);
      return true;
    },
    [drop, undoable],
  );

  /** Shown as approved while its window is open or its request is on its way. */
  const isWaiting = useCallback(
    (id: number) => {
      for (const ids of waiting.values()) if (ids.has(id)) return true;
      return false;
    },
    [waiting],
  );

  return { start, undo, isWaiting, busy: waiting.size > 0 };
}

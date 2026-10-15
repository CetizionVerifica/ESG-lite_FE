import { useCallback, useRef, useState } from "react";
import { type BulkApproveReadyResult } from "../../../services/emissionService";
import { useUndoableApprove } from "../../../ui";
import { commitApproveReady } from "../api";

/**
 * "Approve all N ready" (S3-15) with the same 8 s undo window as a single
 * approve: the ready rows leave the queue at once, the request goes when the
 * window closes (or the page is left), and Undo sends nothing. Each click is
 * one window, keyed by a token in `useUndoableApprove`.
 */
export function useApproveAllReady({
  onDone,
  onFailed,
}: {
  onDone: (result: BulkApproveReadyResult) => Promise<unknown> | void;
  onFailed: (error: unknown) => void;
}) {
  // token → ids waiting in that window.
  const [waiting, setWaiting] = useState<ReadonlyMap<number, ReadonlySet<number>>>(() => new Map());
  const idsOf = useRef(new Map<number, number[]>());
  const nextToken = useRef(1);
  const cb = useRef({ onDone, onFailed });
  cb.current = { onDone, onFailed };

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
      const ids = idsOf.current.get(token) ?? [];
      const result = await commitApproveReady(ids, opts);
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
    (ids: number[]) => {
      const token = nextToken.current++;
      idsOf.current.set(token, ids);
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

  /** Ids shown as approved while their window is open or their request is on its way. */
  const approvedIds = useCallback(
    (id: number) => {
      for (const ids of waiting.values()) if (ids.has(id)) return true;
      return false;
    },
    [waiting],
  );

  return { start, undo, isWaiting: approvedIds, busy: waiting.size > 0 };
}

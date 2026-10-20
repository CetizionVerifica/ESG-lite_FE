// DS-5 · autosave for a design (layer rule 3): changes are sent with the rev
// they were made on, 1 s after the last change. The newest change wins; a
// change made while a save is out waits and goes next, on the new rev. A 409
// DS_VERSION_CONFLICT stops saving until the person reloads (the RS conflict
// dialog); any other failure keeps the change for `retry()`.
//
//   const saver = createAutosaver({ rev, save, onChange });
//   saver.queue({ doc }) / saver.queue({ title }); saver.flush(); saver.retry(); saver.dispose();

export type AutosaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";

export interface AutosaveState {
  status: AutosaveStatus;
  rev: number;
  /** The server's rev on a conflict. */
  serverRev: number | null;
  /** When the last save landed. */
  savedAt: Date | null;
}

export interface AutosaveOptions<P> {
  rev: number;
  delayMs?: number;
  /** Sends `payload` with `rev`; resolves to the new rev. */
  save: (rev: number, payload: P) => Promise<number>;
  onChange?: (state: AutosaveState) => void;
  /** Merges a queued change with a newer one (default: the newer wins). */
  merge?: (older: P, newer: P) => P;
  now?: () => Date;
}

export interface Autosaver<P> {
  queue: (payload: P) => void;
  /** Saves now (e.g. on page leave); resolves when nothing is left to save. */
  flush: () => Promise<void>;
  retry: () => Promise<void>;
  state: () => AutosaveState;
  /**
   * Moves to a newer server rev that didn't change the doc (a report-details
   * save bumps the same rev, DS-2). Ignored while a save is out or after a conflict.
   */
  adoptRev: (rev: number) => void;
  dispose: () => void;
}

/** A 409 with code DS_VERSION_CONFLICT, and the server's rev from `details.rev`. */
export function conflictRev(err: unknown): number | null {
  const res = (err as { response?: { status?: number; data?: { code?: unknown; details?: { rev?: unknown } } } } | null)?.response;
  if (res?.status !== 409 || res.data?.code !== "DS_VERSION_CONFLICT") return null;
  const rev = Number(res.data.details?.rev);
  return Number.isFinite(rev) ? rev : -1;
}

export function createAutosaver<P>(opts: AutosaveOptions<P>): Autosaver<P> {
  const delay = opts.delayMs ?? 1000;
  const now = opts.now ?? (() => new Date());
  const merge = opts.merge ?? ((_a: P, b: P) => b);
  let st: AutosaveState = { status: "saved", rev: opts.rev, serverRev: null, savedAt: null };
  let pending: P | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;

  const set = (patch: Partial<AutosaveState>) => {
    st = { ...st, ...patch };
    if (!disposed) opts.onChange?.(st);
  };
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const run = async (): Promise<void> => {
    while (pending !== null && st.status !== "conflict" && !disposed) {
      const payload = pending;
      pending = null;
      set({ status: "saving" });
      try {
        const rev = await opts.save(st.rev, payload);
        set({ rev, savedAt: now(), status: pending === null ? "saved" : "pending" });
      } catch (err) {
        const server = conflictRev(err);
        if (server !== null) {
          set({ status: "conflict", serverRev: server >= 0 ? server : null });
          pending = pending === null ? payload : merge(payload, pending);
          return;
        }
        pending = pending === null ? payload : merge(payload, pending);
        set({ status: "error" });
        return;
      }
    }
  };

  const start = (): Promise<void> => {
    clear();
    if (!running) {
      running = run().finally(() => {
        running = null;
      });
    }
    return running;
  };

  return {
    queue(payload) {
      if (disposed || st.status === "conflict") return;
      pending = pending === null ? payload : merge(pending, payload);
      if (st.status !== "saving") set({ status: "pending" });
      clear();
      timer = setTimeout(() => void start(), delay);
    },
    async flush() {
      if (pending === null && !running) return;
      await start();
      if (pending !== null && st.status !== "conflict" && st.status !== "error") await start();
    },
    async retry() {
      if (st.status !== "error") return;
      await start();
    },
    state: () => st,
    adoptRev(rev) {
      if (running || st.status === "conflict" || st.status === "saving" || rev <= st.rev) return;
      set({ rev });
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}

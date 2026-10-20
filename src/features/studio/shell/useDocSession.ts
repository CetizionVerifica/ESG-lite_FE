// DS-5 · one open design: the doc and its rev, autosave (PATCH with rev, 1 s
// after the last change; a 409 stops saving and asks to reload), and the
// presence heartbeat (POST /docs/:id/presence every 30 s, R15). DS-6 builds
// its editing on `update` and `rename`.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createAutosaver, type AutosaveState, type Autosaver } from "../../../lib/studio/autosave";
import type { PatchDocBody, ReportDoc, StudioDocResponse } from "../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { docKeys, patchDoc, postPresence, useDoc } from "../docs/api";

export const PRESENCE_EVERY_MS = 30_000;

type Change = Omit<PatchDocBody, "rev">;

export interface DocSession {
  query: ReturnType<typeof useDoc>;
  doc: ReportDoc | null;
  title: string;
  rev: number;
  save: AutosaveState;
  /** Other people with this design open (best effort). */
  others: number;
  /** Replaces the doc locally and saves it 1 s after the last change. */
  update: (next: ReportDoc) => void;
  rename: (title: string) => void;
  flush: () => Promise<void>;
  retry: () => Promise<void>;
  /** After a conflict: drop local changes and load the server's version. */
  reload: () => Promise<void>;
}

const INITIAL: AutosaveState = { status: "saved", rev: 0, serverRev: null, savedAt: null };

export function useDocSession(id: number | null, opts: { delayMs?: number; presenceMs?: number } = {}): DocSession {
  const companyId = useStudioCompanyId();
  const qc = useQueryClient();
  const query = useDoc(id);
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [title, setTitle] = useState("");
  const [save, setSave] = useState<AutosaveState>(INITIAL);
  const [others, setOthers] = useState(0);
  const saver = useRef<Autosaver<Change> | null>(null);
  const loadedRev = useRef<number | null>(null);
  /** Bumped by `reload`, so the server copy is adopted even when it is unchanged. */
  const [generation, setGeneration] = useState(0);

  // A fresh server copy (first load or after a reload) resets the local state and the saver.
  useEffect(() => {
    const data = query.data;
    if (!data || id === null) return;
    if (loadedRev.current !== null && saver.current && save.status !== "saved" && save.status !== "conflict") return;
    if (loadedRev.current === data.rev && saver.current) return;
    loadedRev.current = data.rev;
    setDoc(data.doc);
    setTitle(data.title || data.doc.meta.title);
    saver.current?.dispose();
    saver.current = createAutosaver<Change>({
      rev: data.rev,
      delayMs: opts.delayMs ?? 1000,
      merge: (a, b) => ({ ...a, ...b }),
      save: async (rev, change) => {
        const r: StudioDocResponse = await patchDoc(id, { rev, ...change }, companyId);
        loadedRev.current = r.rev;
        qc.setQueryData(docKeys.doc(companyId, id), r);
        return r.rev;
      },
      onChange: setSave,
    });
    setSave({ ...INITIAL, rev: data.rev });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the server copy changes
  }, [query.data, id, generation]);

  useEffect(() => () => saver.current?.dispose(), []);

  // DS-2's report details save (PATCH /docs/:id/inputs) bumps the same rev without touching the doc: follow it.
  useEffect(() => {
    if (id === null) return;
    return qc.getQueryCache().subscribe((event) => {
      const key = event.query.queryKey;
      if (event.type !== "updated" || key[0] !== "studio" || key[1] !== "docs" || key[2] !== id || key[3] !== "inputs") return;
      const rev = (event.query.state.data as { rev?: unknown } | undefined)?.rev;
      if (typeof rev === "number") saver.current?.adoptRev(rev);
    });
  }, [qc, id]);

  // Presence heartbeat.
  useEffect(() => {
    if (id === null || !query.data) return;
    let stop = false;
    const beat = () =>
      postPresence(id, companyId)
        .then((r) => !stop && setOthers(r.others))
        .catch(() => undefined);
    void beat();
    const t = setInterval(beat, opts.presenceMs ?? PRESENCE_EVERY_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id, companyId, query.data, opts.presenceMs]);

  const update = useCallback((next: ReportDoc) => {
    setDoc(next);
    saver.current?.queue({ doc: next });
  }, []);
  const rename = useCallback(
    (next: string) => {
      const t = next.trim();
      if (!t) return;
      setTitle(t);
      setDoc((d) => (d ? { ...d, meta: { ...d.meta, title: t } } : d));
      saver.current?.queue({ title: t });
    },
    [],
  );
  const reload = useCallback(async () => {
    saver.current?.dispose();
    saver.current = null;
    loadedRev.current = null;
    await query.refetch();
    setGeneration((g) => g + 1);
  }, [query]);

  return {
    query,
    doc,
    title,
    rev: save.rev,
    save,
    others,
    update,
    rename,
    flush: () => saver.current?.flush() ?? Promise.resolve(),
    retry: () => saver.current?.retry() ?? Promise.resolve(),
    reload,
  };
}

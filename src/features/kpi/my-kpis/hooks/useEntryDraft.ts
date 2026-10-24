import { useCallback, useEffect, useRef, useState } from "react";
import type { KpiEvidenceOut, KpiValue, MyKpiItem } from "../../../../lib/kpi/contracts";
import type { FileDropItem } from "../../../../ui";
import type { EntryDraft } from "../../components/KpiQuestionCard";
import { codeMessage, kpiErrorMessage, useEvidence, useSaveDraft } from "../api";
import { draftFromValue, itemKey, toValueInput } from "../logic";

/** How long typing has to pause before the draft saves (layer rule 4). */
export const AUTOSAVE_MS = 1000;

export type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

/**
 * One entry's draft (layer rule 4, "never lose work"): saves after 1 s idle
 * and on blur, one request at a time, and keeps what was typed when a save
 * fails (the message says why). `flush()` saves now and resolves with the
 * saved value, null when there's nothing saved (or to save) yet, and
 * undefined when the save failed.
 */
export function useEntryDraft(item: MyKpiItem, listKey: readonly unknown[], editable: boolean) {
  const key = itemKey(item);
  const save = useSaveDraft(listKey);
  const evidenceApi = useEvidence();
  const [draft, setDraft] = useState<EntryDraft>(() => draftFromValue(item));
  const [state, setState] = useState<SaveState>(item.value ? "saved" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<FileDropItem[]>([]);
  const [added, setAdded] = useState<KpiEvidenceOut[]>([]);
  const [removed, setRemoved] = useState<number[]>([]);

  const draftRef = useRef(draft);
  const valueRef = useRef<KpiValue | null>(item.value);
  const pending = useRef(false);
  const inflight = useRef<Promise<KpiValue | undefined> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  if (item.value && (!valueRef.current || item.value.updated_at >= (valueRef.current.updated_at ?? ""))) valueRef.current = item.value;

  const run = useCallback(async (): Promise<KpiValue | undefined> => {
    pending.current = false;
    setState("saving");
    try {
      const r = await save.mutateAsync({ input: toValueInput(itemRef.current, draftRef.current), key });
      if (r.ok) {
        valueRef.current = r.value;
        setError(null);
        setState(pending.current ? "unsaved" : "saved");
        return r.value;
      }
      setError(codeMessage(r.code, r.message || "This value couldn't be saved."));
      setState("error");
      return undefined;
    } catch (e) {
      setError(kpiErrorMessage(e, "Couldn't save the draft. Check your connection; what you typed is still here."));
      setState("error");
      pending.current = true;
      return undefined;
    }
  }, [key, save]);

  const flush = useCallback(async (): Promise<KpiValue | null | undefined> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inflight.current) await inflight.current;
    if (!pending.current) return valueRef.current;
    const p = run();
    inflight.current = p;
    try {
      return await p;
    } finally {
      inflight.current = null;
    }
  }, [run]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  const change = useCallback(
    (patch: Partial<EntryDraft>) => {
      if (!editable) return;
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      setDraft(next);
      pending.current = true;
      setState("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flushRef.current(), AUTOSAVE_MS);
    },
    [editable],
  );

  // Leaving the card saves what's left (the drawer also flushes before it closes).
  useEffect(
    () => () => {
      if (pending.current) void flushRef.current();
    },
    [],
  );

  /** Uploads files to the value, saving the draft first when it has no id yet. */
  const addFiles = useCallback(
    async (files: File[]) => {
      let value = await flushRef.current();
      if (value === null) {
        pending.current = true;
        value = await flushRef.current();
      }
      if (!value) return;
      const valueId = value.id;
      for (const file of files) {
        const id = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`;
        setUploads((u) => [...u, { id, file, status: "uploading", progress: 30 }]);
        try {
          const ev = await evidenceApi.upload.mutateAsync({ valueId, file });
          setAdded((a) => [...a, ev]);
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: "done", progress: 100 } : x)));
        } catch (e) {
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: "error", error: kpiErrorMessage(e, "Upload failed. Try again.") } : x)));
        }
      }
    },
    [evidenceApi.upload],
  );

  const removeEvidence = useCallback(
    async (ev: KpiEvidenceOut) => {
      const valueId = valueRef.current?.id;
      if (!valueId) return;
      setRemoved((r) => [...r, ev.id]);
      try {
        await evidenceApi.remove.mutateAsync({ valueId, evidenceId: ev.id });
      } catch (e) {
        setRemoved((r) => r.filter((x) => x !== ev.id));
        setError(kpiErrorMessage(e, "Couldn't remove the file."));
      }
    },
    [evidenceApi.remove],
  );

  const server = item.value?.evidence ?? [];
  const evidence = [...server, ...added.filter((a) => !server.some((s) => s.id === a.id))].filter((e) => !removed.includes(e.id));

  return { draft, change, flush, state, error, evidence, uploads: uploads.filter((u) => u.status !== "done"), addFiles, removeEvidence, dirty: state === "unsaved" || state === "saving" };
}

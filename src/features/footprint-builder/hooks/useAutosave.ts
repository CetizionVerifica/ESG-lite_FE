import { useCallback, useEffect, useRef, useState } from "react";
import { useDebounced } from "../../../ui";

export type SaveState = "saved" | "pending" | "saving" | "error";

/**
 * Saves `value` once it has stopped changing for `delay` ms. One save runs at
 * a time; edits made during a save are sent right after it. `initial` is what
 * the server already holds, so loading a study doesn't save it straight back.
 */
export function useAutosave<T>(value: T, initial: T, save: (v: T) => Promise<unknown>, delay = 800) {
  const json = JSON.stringify(value);
  const settled = useDebounced(json, delay);
  const saved = useRef(JSON.stringify(initial));
  const busy = useRef(false);
  const failed = useRef<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (busy.current || settled === failed.current) return;
    if (settled === saved.current) {
      setState(json === saved.current ? "saved" : "pending");
      return;
    }
    busy.current = true;
    setState("saving");
    const sent = settled;
    saveRef
      .current(JSON.parse(sent) as T)
      .then(() => {
        saved.current = sent;
        failed.current = null;
        setError(null);
        setState("saved");
      })
      .catch((e: unknown) => {
        failed.current = sent;
        setError(e);
        setState("error");
      })
      .finally(() => {
        busy.current = false;
        // Pick up edits that arrived while saving; a failed value waits for retry or a new edit.
        setTick((t) => t + 1);
      });
    // `tick` re-runs this after a save; `json` only updates the indicator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, tick]);

  useEffect(() => {
    if (state !== "saving" && json !== saved.current && json !== failed.current) setState("pending");
  }, [json, state]);

  const retry = useCallback(() => {
    failed.current = null;
    setTick((t) => t + 1);
  }, []);

  return { state, error, retry, dirty: json !== saved.current };
}

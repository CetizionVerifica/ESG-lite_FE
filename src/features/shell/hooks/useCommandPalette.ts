import { useCallback, useEffect, useState } from "react";
import { pushRecent } from "../commands";

const KEY = "esglite.recentCommands";

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** ⌘K / Ctrl+K toggles the palette; remembers the last commands run. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(readRecent);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const remember = useCallback((id: string) => {
    setRecent((prev) => {
      const next = pushRecent(prev, id);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage blocked: recent items last for this tab only.
      }
      return next;
    });
  }, []);

  return { open, setOpen, recent, remember };
}

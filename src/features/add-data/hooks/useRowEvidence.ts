import { useCallback, useEffect, useState } from "react";
import type { FileDropItem } from "../../../ui";

// Files picked as evidence for typed rows, by row id. Kept in memory only
// (files can't go in the sessionStorage draft) and uploaded after the row is saved.

export type RowEvidence = {
  items: Record<number, FileDropItem[]>;
  add: (rowId: number, files: File[]) => void;
  remove: (rowId: number, itemId: string) => void;
  filesOf: (rowId: number) => File[];
};

let seq = 0;

export function useRowEvidence(draftKey: string | null): RowEvidence {
  const [items, setItems] = useState<Record<number, FileDropItem[]>>({});
  // Another site, category or period starts with no files.
  useEffect(() => setItems({}), [draftKey]);
  const add = useCallback(
    (rowId: number, files: File[]) =>
      setItems((s) => ({ ...s, [rowId]: [...(s[rowId] ?? []), ...files.map((file) => ({ id: `ev-${++seq}`, file }))] })),
    [],
  );
  const remove = useCallback((rowId: number, itemId: string) => setItems((s) => ({ ...s, [rowId]: (s[rowId] ?? []).filter((i) => i.id !== itemId) })), []);
  const filesOf = useCallback((rowId: number) => (items[rowId] ?? []).map((i) => i.file), [items]);
  return { items, add, remove, filesOf };
}

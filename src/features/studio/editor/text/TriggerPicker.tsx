// DS-7 · the `{{` data picker under the caret, driven by the trigger plugin's keys.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import type { DataItem } from "../../../../lib/studio/contracts";
import type { ChipScope } from "./chipData";
import { DataPicker } from "./DataPicker";
import { dismissTrigger, type TriggerState } from "./extensions";
import type { PickerItem } from "./picker";
import { insertChip } from "./useStudioText";

export function TriggerPicker({ editor, trigger, keyRef, scope }: { editor: Editor | null; trigger: TriggerState; keyRef: React.MutableRefObject<(e: KeyboardEvent) => boolean>; scope: ChipScope }) {
  const [active, setActive] = useState(0);
  const items = useRef<PickerItem[]>([]);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const onItems = useCallback((list: PickerItem[]) => {
    items.current = list;
    setActive((a) => Math.min(a, Math.max(0, list.length - 1)));
  }, []);

  useEffect(() => setActive(0), [trigger.query, trigger.from]);
  useLayoutEffect(() => {
    if (!editor || !trigger.active) return setPos(null);
    try {
      const c = editor.view.coordsAtPos(trigger.from);
      setPos({ left: Math.max(8, Math.min(c.left, window.innerWidth - 340)), top: c.bottom + 6 });
    } catch {
      setPos({ left: 16, top: 16 });
    }
  }, [editor, trigger]);

  const pick = useCallback(
    (item: DataItem) => {
      if (editor) insertChip(editor, item, { from: trigger.from, to: trigger.to });
    },
    [editor, trigger.from, trigger.to],
  );

  useEffect(() => {
    keyRef.current = (e) => {
      if (!editor || !trigger.active) return false;
      const n = items.current.length;
      if (e.key === "ArrowDown") setActive((a) => (n ? (a + 1) % n : 0));
      else if (e.key === "ArrowUp") setActive((a) => (n ? (a - 1 + n) % n : 0));
      else if (e.key === "Enter" || e.key === "Tab") {
        const it = items.current[active];
        if (!it) return false;
        pick(it.item);
      } else if (e.key === "Escape") dismissTrigger(editor);
      else return false;
      return true;
    };
  }, [editor, trigger.active, active, pick, keyRef]);

  if (!trigger.active || !pos) return null;
  return createPortal(
    <div
      role="dialog"
      aria-label="Insert data value"
      data-ds-text-keep=""
      className="fixed z-[80] w-80 rounded-control border border-line bg-panel p-2 shadow-lg"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="px-2 pb-1 text-xs text-muted">{scope.kind === "ghg" ? "Emissions data" : "KPIs"} · ↑↓ to choose, Enter to insert</p>
      <DataPicker scope={scope} query={trigger.query} active={active} onActive={setActive} onPick={pick} onItems={onItems} />
    </div>,
    document.body,
  );
}

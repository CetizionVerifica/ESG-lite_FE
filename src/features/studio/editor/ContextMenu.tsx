// DS-6 · the right-click menu on a page (RS S3): the toolbar's actions plus
// layer order, group, lock, "Replace image" and "Ask AI about this". On empty
// page it offers paste and the page's own actions. Arrows move, Enter
// selects, Esc closes.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { groupElements, reorderZ, setLocked, takesImage, ungroupElements } from "../../../lib/studio/docOps";
import { cn, portalRoot } from "../../../ui";
import { moreItems } from "./actions";
import { useEditor } from "./EditorContext";
import type { Command } from "./shortcuts";

type Item = { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean } | { kind: "separator" };

export function ContextMenu({ at, onClose, run }: { at: { x: number; y: number }; onClose: () => void; run: (cmd: Command) => void }) {
  const ed = useEditor();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const sel = ed.selected;
  const pageId = ed.page?.id ?? "";
  const ids = sel.map((e) => e.id);
  const ro = ed.readOnly;

  const items: Item[] = sel.length
    ? [
        ...moreItems(ed).slice(0, 3),
        { kind: "separator" },
        { label: "Bring forward", disabled: ro, onSelect: () => ed.commit(reorderZ(ed.doc, pageId, ids, "forward"), "Bring forward") },
        { label: "Send backward", disabled: ro, onSelect: () => ed.commit(reorderZ(ed.doc, pageId, ids, "backward"), "Send backward") },
        sel.length > 1 && sel.every((e) => e.groupId && e.groupId === sel[0].groupId)
          ? { label: "Ungroup", disabled: ro, onSelect: () => ed.commit(ungroupElements(ed.doc, pageId, ids), "Ungroup") }
          : { label: "Group", disabled: ro || sel.length < 2, onSelect: () => ed.commit(groupElements(ed.doc, pageId, ids, { newId: ed.newId }).doc, "Group") },
        { label: sel.every((e) => e.locked) ? "Unlock" : "Lock", disabled: ro, onSelect: () => ed.commit(setLocked(ed.doc, pageId, ids, !sel.every((e) => e.locked)), "Lock") },
        ...(sel.length === 1 && takesImage(sel[0]) ? [{ label: "Replace image", onSelect: () => ed.openDrawer("uploads") }] : []),
        { label: "Position…", onSelect: () => ed.openPosition("arrange") },
        { kind: "separator" },
        { label: "Comment", onSelect: () => ed.setCommentMode(true) },
        { label: "Ask AI about this", onSelect: () => ed.openDrawer("ai") },
        { kind: "separator" },
        ...moreItems(ed).slice(-1),
      ]
    : [
        { label: "Paste", disabled: ro || !ed.page, onSelect: () => run({ id: "paste" }) },
        { label: "Select all", disabled: !ed.page, onSelect: () => ed.page && ed.select(ed.page.elements.filter((e) => !e.hidden && !e.templateLocked).map((e) => e.id)) },
        { label: "Layers…", onSelect: () => ed.openPosition("layers") },
        { kind: "separator" },
        { label: "Comment here", onSelect: () => ed.setCommentMode(true) },
      ];
  const enabled = items.map((it, i) => ("kind" in it || it.disabled ? -1 : i)).filter((i) => i >= 0);
  const [active, setActive] = useState(enabled[0] ?? 0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.min(at.x, window.innerWidth - r.width - 8), y: Math.min(at.y, window.innerHeight - r.height - 8) });
    el.focus();
  }, [at]);
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("pointerdown", down);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const onKey = (e: KeyboardEvent) => {
    const at2 = enabled.indexOf(active);
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") setActive(enabled[(at2 + 1) % enabled.length]);
    else if (e.key === "ArrowUp") setActive(enabled[(at2 - 1 + enabled.length) % enabled.length]);
    else if (e.key === "Enter" || e.key === " ") {
      const it = items[active];
      if (it && !("kind" in it)) {
        it.onSelect();
        onClose();
      }
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return createPortal(
    <div ref={ref} role="menu" aria-label="Element actions" tabIndex={-1} onKeyDown={onKey} className="fixed z-50 min-w-48 rounded-card border border-line bg-panel py-1 shadow-lg outline-none" style={{ left: pos.x, top: pos.y }} data-testid="context-menu">
      {items.map((it, i) =>
        "kind" in it ? (
          <div key={i} role="separator" className="my-1 h-px bg-line" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            tabIndex={-1}
            onMouseEnter={() => setActive(i)}
            onClick={() => {
              it.onSelect();
              onClose();
            }}
            className={cn("block w-full px-3 py-1.5 text-left text-sm disabled:opacity-40", it.danger ? "text-bad" : "text-ink", active === i && "bg-tint")}
          >
            {it.label}
          </button>
        ),
      )}
    </div>,
    portalRoot(),
  );
}


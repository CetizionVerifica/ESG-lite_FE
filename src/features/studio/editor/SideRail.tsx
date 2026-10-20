// DS-6 · the side rail (72 px, a vertical tablist) and the drawer (340 px)
// it opens. Clicking the open tab again closes the drawer. Each tab's drawer
// is whatever its module registered (registry.ts); the drawer keeps its
// scroll position per tab. The Position panel opens in the same place.
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { RAIL_TABS } from "./railTabs";
import { cn, focusRing } from "../../../ui";
import { useEditor } from "./EditorContext";
import { PositionPanel } from "./PositionPanel";
import { getDrawer, registryVersion, subscribeRegistry } from "./registry";
import { DRAWER_IDS, type DrawerId } from "./state";

export function SideRail() {
  const ed = useEditor();
  const { ui } = ed;
  const refs = useRef<Partial<Record<DrawerId, HTMLButtonElement | null>>>({});
  const current = ui.position ? null : ui.drawer;

  const onKey = (e: KeyboardEvent, i: number) => {
    const n = DRAWER_IDS.length;
    let j = -1;
    if (e.key === "ArrowDown") j = (i + 1) % n;
    else if (e.key === "ArrowUp") j = (i - 1 + n) % n;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = n - 1;
    if (j < 0) return;
    e.preventDefault();
    refs.current[DRAWER_IDS[j]]?.focus();
  };

  return (
    <nav aria-label="Insert" className="flex w-[72px] flex-none flex-col items-center gap-0.5 overflow-y-auto border-r border-line bg-panel py-2">
      <div role="tablist" aria-orientation="vertical" aria-label="Side panels" className="flex flex-col items-center gap-0.5">
        {DRAWER_IDS.map((id, i) => {
          const t = RAIL_TABS[id];
          const on = current === id;
          const Icon = t.icon;
          return (
            <button
              key={id}
              ref={(el) => {
                refs.current[id] = el;
              }}
              role="tab"
              id={`rail-${id}`}
              aria-selected={on}
              aria-controls={on ? "studio-drawer" : undefined}
              tabIndex={on || (!current && i === 0) ? 0 : -1}
              onClick={() => ed.openDrawer(id, true)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn("flex w-16 flex-col items-center gap-1 rounded-control py-2 text-[11px] font-medium", on ? "bg-brand-50 text-brand-text" : "text-muted hover:bg-tint hover:text-ink", focusRing)}
            >
              <Icon aria-hidden className="size-5" />
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const scrollMemory = new Map<string, number>();

/** The drawer area: the open tab's registered drawer, or the Position panel. */
export function DrawerHost() {
  const ed = useEditor();
  const { ui } = ed;
  useSyncExternalStore(subscribeRegistry, registryVersion, registryVersion);
  const body = useRef<HTMLDivElement>(null);
  const key = ui.position ? "position" : (ui.drawer ?? "");

  // Restore this tab's scroll; remember it on the way out.
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    el.scrollTop = scrollMemory.get(key) ?? 0;
  }, [key]);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const save = () => scrollMemory.set(key, el.scrollTop);
    el.addEventListener("scroll", save, { passive: true });
    return () => el.removeEventListener("scroll", save);
  }, [key]);

  if (!ui.drawer && !ui.position) return null;
  const title = ui.position ? "Position" : RAIL_TABS[ui.drawer as DrawerId].label;
  const Drawer = ui.drawer && !ui.position ? getDrawer(ui.drawer) : null;

  return (
    <aside
      id="studio-drawer"
      role={ui.position ? "region" : "tabpanel"}
      aria-labelledby={ui.position ? undefined : `rail-${ui.drawer}`}
      aria-label={ui.position ? "Position" : undefined}
      className="flex w-[340px] flex-none flex-col border-r border-line bg-panel"
      data-testid="drawer"
      data-drawer={key}
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="flex-1 text-sm font-semibold text-ink">{title}</h2>
        <button
          type="button"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={() => (ui.position ? ed.openPosition(null) : ed.openDrawer(null))}
          className={cn("rounded-chip p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto p-4">
        {ui.position ? (
          <PositionPanel />
        ) : Drawer ? (
          <Drawer doc={ed.doc} docId={ed.docId} pageId={ui.pageId} selection={ui.selection} commit={(next, label) => ed.commit(next, label)} preview={ed.preview} editor={ed} />
        ) : null}
      </div>
    </aside>
  );
}


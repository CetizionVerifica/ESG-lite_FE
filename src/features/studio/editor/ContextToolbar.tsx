// DS-6 · the contextual toolbar (44 px above the page). The left part is the
// toolbar registered for the selection's type (registry.ts); the common tail
// is always there: Position, Transparency, the link mark, Lock and ⋯ (copy
// style, paste style, duplicate, comment, Ask AI, delete). The row never wraps:
// it measures its own width (drawers, full screen and the window all change it)
// and first drops button labels to icons, then folds the type part into a
// "Tools" popover.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Droplet, Link2, Lock, LockOpen, MoreHorizontal, SlidersHorizontal, Unlink } from "lucide-react";
import { setLocked, setOpacity } from "../../../lib/studio/docOps";
import { moreItems } from "./actions";
import { Menu, Popover, Tooltip, cn } from "../../../ui";
import { useEditor } from "./EditorContext";
import { getToolbar, registryVersion, subscribeRegistry, toolbarKeyFor } from "./registry";
import { bindingOf, linkMarkText } from "./renderInputs";
import { Sep, TbButton } from "./toolbars";

/** How much the row shows: 0 full labels, 1 icons only, 2 the type tools folded into "Tools". */
export type ToolbarFit = 0 | 1 | 2;

/**
 * Steps the toolbar down while its content is wider than the row, before paint.
 * When the row gets wider again, or the selection changes, it starts from full labels.
 */
function useToolbarFit(resetKey: string): [React.RefObject<HTMLDivElement | null>, ToolbarFit] {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<ToolbarFit>(0);
  const steppedAt = useRef(0);
  useLayoutEffect(() => setFit(0), [resetKey]);
  // No deps on purpose: content can grow at the same width (editing adds buttons), so it
  // re-measures after every render; it stops at 2, so it can't loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || fit === 2 || el.scrollWidth <= el.clientWidth + 1) return;
    steppedAt.current = el.clientWidth;
    setFit((f) => (f < 2 ? ((f + 1) as ToolbarFit) : f));
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (steppedAt.current && el.clientWidth > steppedAt.current + 8) {
        steppedAt.current = 0;
        setFit(0);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, fit];
}

export function ContextToolbar() {
  const ed = useEditor();
  useSyncExternalStore(subscribeRegistry, registryVersion, registryVersion);
  const { page, selected, ui, readOnly } = ed;
  const pageId = ui.pageId ?? "";
  const key = toolbarKeyFor(selected);
  const Tools = getToolbar(key);
  const ids = selected.map((e) => e.id);
  const [rowRef, fit] = useToolbarFit(`${key}:${ids.join(",")}`);
  const fold = fit === 2 && key !== "page";
  const locked = selected.length > 0 && selected.every((e) => e.locked);
  const single = selected.length === 1 ? selected[0] : null;
  const binding = single ? bindingOf(single) : undefined;
  const value = binding ? ed.render.resolved.find((r) => JSON.stringify(r.binding) === JSON.stringify(binding))?.value : undefined;
  const link = linkMarkText(binding, value, ed.render.status);
  const opacity = selected.length ? Math.round((selected[0].opacity ?? 1) * 100) : 100;
  const label = key === "page" ? "Page" : key === "multi" ? "Selection" : `${key.replace(/_/g, " ")}`;

  return (
    <div role="toolbar" aria-label={`${label[0].toUpperCase()}${label.slice(1)} tools`} data-testid="context-toolbar" data-toolbar={key} data-tb-compact={fit > 0} data-tb-fit={fit} ref={rowRef} className="flex h-11 flex-none items-center gap-1 overflow-hidden border-b border-line bg-panel px-2.5">
      {Tools && !fold && <Tools doc={ed.doc} pageId={pageId} elements={selected} editor={ed} />}
      {Tools && fold && (
        <Popover
          label="Tools"
          trigger={(t) => (
            <TbButton {...t} icon={<SlidersHorizontal aria-hidden className="size-4" />}>
              Tools
            </TbButton>
          )}
        >
          {() => (
            <div className="flex max-w-[90vw] flex-wrap items-center gap-1 p-1">
              <Tools doc={ed.doc} pageId={pageId} elements={selected} editor={ed} compact />
            </div>
          )}
        </Popover>
      )}
      <div className="flex-1" />
      {selected.length > 0 && page && (
        <>
          <TbButton active={!!ui.position} onClick={() => ed.openPosition(ui.position ? null : "arrange")}>
            Position
          </TbButton>
          <Popover
            label="Transparency"
            align="end"
            trigger={(t) => (
              <TbButton {...t} aria-label={`Transparency ${opacity}%`} title="Transparency" disabled={readOnly || locked} icon={<Droplet aria-hidden className="size-4" />}>
                <span className="font-num text-xs">{opacity}%</span>
              </TbButton>
            )}
          >
            {() => (
              <label className="flex w-56 items-center gap-3 p-2 text-sm text-ink">
                <span>Transparency</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={opacity}
                  aria-label="Transparency"
                  onChange={(e) => ed.commit(setOpacity(ed.doc, page.id, ids, Number(e.target.value) / 100), "Transparency", { mergeKey: `opacity:${ids.join(",")}` })}
                  className="flex-1 accent-brand"
                />
                <span className="w-9 text-right font-num text-xs">{opacity}%</span>
              </label>
            )}
          </Popover>
          {link && (
            <Tooltip content={link.text}>
              <button type="button" onClick={() => ed.openDrawer("data")} className={cn("inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium hover:bg-tint", link.linked ? "text-good" : "text-warn")} data-testid="toolbar-link">
                {link.linked ? <Link2 aria-hidden className="size-4" /> : <Unlink aria-hidden className="size-4" />}
                {link.linked ? "Linked" : "Unlinked"}
              </button>
            </Tooltip>
          )}
          <TbButton
            aria-label={locked ? "Unlock" : "Lock"}
            title={locked ? "Unlock" : "Lock"}
            active={locked}
            disabled={readOnly || selected.every((e) => e.templateLocked)}
            onClick={() => ed.commit(setLocked(ed.doc, page.id, ids, !locked), locked ? "Unlock" : "Lock")}
            icon={locked ? <Lock aria-hidden className="size-4" /> : <LockOpen aria-hidden className="size-4" />}
          />
          <Sep />
          <Menu
            label="More"
            trigger={(t) => (
              <button {...t} type="button" aria-label="More" className="inline-flex h-8 items-center rounded-control px-2 text-ink hover:bg-tint">
                <MoreHorizontal aria-hidden className="size-4" />
              </button>
            )}
            items={moreItems(ed)}
          />
        </>
      )}
    </div>
  );
}

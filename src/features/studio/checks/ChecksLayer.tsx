// DS-12 · inline markers on the page (RS S5): a red wavy underline under text
// with a mismatched number, an amber dot on AI text not yet reviewed, and a
// small flag on any other element with an open check. Overflow keeps DS-7's
// red corner and "+N lines" tag. A marker opens the panel at its row.
import { checkKey } from "../../../lib/studio/checks";
import type { Check } from "../../../lib/studio/contracts";
import { cn, focusRing } from "../../../ui";
import { scaleOf } from "../editor/canvasUtil";
import { useEditor } from "../editor/EditorContext";
import type { PageOverlayProps } from "../editor/registry";
import { openChecks, useChecksState } from "./store";

/** Element checks drawn elsewhere (DS-7's overflow tag) or not tied to a spot. */
const OWN_MARKER = new Set<Check["id"]>(["TEXT_OVERFLOW"]);

export function ChecksLayer({ page, zoom }: PageOverlayProps) {
  const ed = useEditor();
  const { data } = useChecksState(ed.docId);
  if (!data) return null;
  const k = scaleOf(zoom);
  const byEl = new Map<string, Array<{ c: Check }>>();
  for (const c of data.checks) {
    if (c.pageId !== page.id || !c.elementId || OWN_MARKER.has(c.id) || c.severity === "info") continue;
    byEl.set(c.elementId, [...(byEl.get(c.elementId) ?? []), { c }]);
  }
  // The panel keys rows by their place in their group (checkKey(c, i)).
  const panelKey = (c: Check) => {
    const sameGroup = data.checks.filter((x) => x.severity === c.severity);
    return checkKey(c, sameGroup.indexOf(c));
  };
  return (
    <>
      {page.elements.map((el) => {
        const list = byEl.get(el.id);
        if (!list || el.hidden) return null;
        const f = el.frame;
        const mismatch = list.find((x) => x.c.id === "NUMBER_MISMATCH");
        const ai = list.find((x) => x.c.id === "AI_UNREVIEWED");
        const other = list.find((x) => x.c.id !== "NUMBER_MISMATCH" && x.c.id !== "AI_UNREVIEWED");
        const worst = list.some((x) => x.c.severity === "error") ? "error" : "warning";
        return (
          <div key={el.id}>
            {mismatch && (
              <button
                type="button"
                aria-label={`Number check: ${mismatch.c.message}`}
                title={mismatch.c.message}
                data-marker="number"
                onClick={() => openChecks(ed.docId, panelKey(mismatch.c))}
                className={cn("pointer-events-auto absolute", focusRing)}
                style={{ left: f.x * k, top: (f.y + f.h) * k - 4, width: f.w * k, height: 6, backgroundImage: "radial-gradient(circle at 3px -1px, transparent 3px, var(--color-bad) 3px, var(--color-bad) 4px, transparent 4px)", backgroundSize: "6px 6px", backgroundRepeat: "repeat-x" }}
              />
            )}
            {ai && (
              <button
                type="button"
                aria-label="Suggested by AI, not reviewed yet"
                title="Suggested by AI, not reviewed yet"
                data-marker="ai"
                onClick={() => openChecks(ed.docId, panelKey(ai.c))}
                className={cn("pointer-events-auto absolute size-2.5 rounded-full bg-warn ring-2 ring-panel", focusRing)}
                style={{ left: (f.x + f.w) * k - 5, top: f.y * k - 5 }}
              />
            )}
            {other && (
              <button
                type="button"
                aria-label={`Check: ${other.c.message}`}
                title={other.c.message}
                data-marker="check"
                onClick={() => openChecks(ed.docId, panelKey(other.c))}
                className={cn("pointer-events-auto absolute flex h-4 min-w-4 items-center justify-center rounded-chip px-1 text-[10px] font-semibold leading-none text-panel", worst === "error" ? "bg-bad" : "bg-warn", focusRing)}
                style={{ left: f.x * k - 6, top: f.y * k - 6 }}
              >
                !
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

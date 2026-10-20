// DS-12 · the top bar's "⚑ 3 checks" (05-ux editor anatomy): runs the checks
// as the design is saved, shows errors + warnings, and opens the panel.
import { Flag } from "lucide-react";
import { counterLabel } from "../../../lib/studio/checks";
import { cn, focusRing } from "../../../ui";
import { useEditor } from "../editor/EditorContext";
import { useChecksRunner } from "./api";
import { closeChecks, openChecks, useChecksState } from "./store";

export function ChecksButton() {
  const ed = useEditor();
  // The run sends the sheets' live measurements: wait for the figures, so a
  // sheet still loading them isn't measured (or counted) as "not reported".
  const figuresLoading = ed.render.status === "loading";
  useChecksRunner(ed.docId, ed.doc, !figuresLoading);
  const { data, open } = useChecksState(ed.docId);
  const checks = data?.checks;
  const errors = (checks ?? []).filter((c) => c.severity === "error").length;
  const warnings = (checks ?? []).filter((c) => c.severity === "warning").length;
  const tone = errors ? "border-bad/40 bg-bad-soft text-bad" : warnings ? "border-warn/40 bg-warn-soft text-warn" : "border-line text-ink";
  return (
    <button
      type="button"
      aria-pressed={open}
      aria-controls="studio-checks"
      onClick={() => {
        if (open) closeChecks(ed.docId);
        else {
          ed.openDrawer(null);
          openChecks(ed.docId);
        }
      }}
      title={errors ? `${errors} must fix before the final` : undefined}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-[13px] font-medium", tone, focusRing)}
      data-testid="checks-counter"
    >
      <Flag aria-hidden className="size-4" />
      {counterLabel(checks)}
    </button>
  );
}

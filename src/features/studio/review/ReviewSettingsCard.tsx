// DS-13 · company review settings on the studio home: "Require approval
// before a final" (Managers, D14) and "Brand controls" (Superadmin, DS-13 §5:
// colours and fonts from the brand kit only; template locks stay for Admins).
import { ShieldCheck } from "lucide-react";
import { Callout, Toggle } from "../../../ui";
import { dsError } from "../share/api";
import { useSafeToast } from "../share/useSafeToast";
import { useReviewSettings, useSaveReviewSettings } from "./api";

export function ReviewSettingsCard() {
  const q = useReviewSettings();
  const save = useSaveReviewSettings();
  const toast = useSafeToast();
  if (!q.data) return null;
  const s = q.data;
  const set = (patch: { requireReview?: boolean; brandControls?: boolean }) =>
    save.mutate(patch, { onError: (err) => toast({ title: dsError(err).message ?? "The setting couldn't be saved.", tone: "bad" }) });
  return (
    <section aria-labelledby="ds13-review-settings" className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4" data-testid="review-settings">
      <h2 id="ds13-review-settings" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ShieldCheck aria-hidden className="size-4 text-muted" /> Review and brand
      </h2>
      <Toggle
        label="Require approval before a final"
        help={s.canEditRequireReview ? "A Manager approves the design as it is; any later edit needs a new approval." : "Only a Manager can change this."}
        checked={s.requireReview}
        disabled={!s.canEditRequireReview || save.isPending}
        onChange={(v) => set({ requireReview: v })}
        inlineLabel={s.requireReview ? "On" : "Off"}
      />
      <Toggle
        label="Brand controls"
        help={s.canEditBrandControls ? "Colours and fonts come from the brand kit only, and Admins can't unlock template elements." : "Set by ESGLite support (Superadmin)."}
        checked={s.brandControls}
        disabled={!s.canEditBrandControls || save.isPending}
        onChange={(v) => set({ brandControls: v })}
        inlineLabel={s.brandControls ? "On" : "Off"}
      />
      {q.isError && <Callout tone="warn">The settings couldn't load.</Callout>}
    </section>
  );
}

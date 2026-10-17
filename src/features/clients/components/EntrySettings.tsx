import { useState } from "react";
import { SegmentedControl, Select, panel, useToast } from "../../../ui";
import { SUPPORTED_CURRENCIES } from "../../../lib/scope3/spend";
import { errorMessage, useUpdateCompany } from "../api";
import type { ClientRow } from "../logic";

type Detail = "total" | "full";

/**
 * Overview → "Data entry" (SE-2, SE-3). `company.entry_detail`: what the
 * client's Users see where they enter data, the total only (default) or the
 * full calculation. `company.default_currency`: the currency a spend row takes
 * when neither the row nor its form names one. Reviewers always see the detail.
 */
export function EntrySettings({ row }: { row: ClientRow }) {
  const update = useUpdateCompany();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const detail: Detail = row.entry_detail === "full" ? "full" : "total";
  const currency = row.default_currency || "INR";

  const save = (data: Record<string, unknown>, done: string) => {
    setError(null);
    update.mutate(
      { id: row.company_id, data },
      {
        onSuccess: () => toast({ title: done, tone: "good" }),
        onError: (e) => setError(errorMessage(e, "The setting wasn't changed. Try again.")),
      },
    );
  };

  return (
    <section aria-labelledby="entry-settings-title" className={`${panel} space-y-4 p-5`} data-testid="entry-settings">
      <div className="space-y-1">
        <h2 id="entry-settings-title" className="text-base font-semibold text-ink">
          Data entry
        </h2>
        <p className="text-sm text-muted">
          What the client's contributors see when they add data, and the currency of an amount spent when nothing else says. Managers and admins always see the full
          calculation where they review.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <SegmentedControl<Detail>
            label="Contributors see"
            value={detail}
            onChange={(v) => v !== detail && save({ entry_detail: v }, v === "full" ? `${row.name}: contributors see the full calculation` : `${row.name}: contributors see the total only`)}
            options={[
              { value: "total", label: "Total only" },
              { value: "full", label: "Full calculation" },
            ]}
          />
          <p className="text-xs text-muted">
            {detail === "full" ? "Factor, method and Category 3 lines show on Add data and My entries." : "Their fields and the tCO₂e total, like the old screens."}
          </p>
        </div>
        <Select<string>
          label="Default currency"
          value={currency}
          onChange={(v) => v && v !== currency && save({ default_currency: v }, `${row.name}: default currency ${v}`)}
          options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))}
          help="Used for an amount spent when the row and its form name no currency."
          disabled={update.isPending}
        />
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
    </section>
  );
}

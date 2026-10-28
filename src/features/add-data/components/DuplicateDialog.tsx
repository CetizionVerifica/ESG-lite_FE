import { useEffect, useState } from "react";
import { Button, Modal, SegmentedControl, formatNumber } from "../../../ui";
import { enteredByText, replaceBlocked, replaceWhereAllowed, type SavedMatch } from "../logic/duplicate";

/** Keep both (F-06): a second bill for the same month is saved as its own entry; the Manager sees it as a possible duplicate. */
export type DuplicateChoice = "replace" | "keep" | "skip";

export type DuplicateItem = {
  id: number | string;
  /** "Row 2 · Diesel" */
  label: string;
  tco2e: number | null;
  /** The server's 409 message. */
  message: string;
  /** The saved entry it collides with, who entered it and whether it may be replaced, when the server sent it. */
  existing: SavedMatch | null;
};

type Props = {
  open: boolean;
  periodLabel: string;
  items: DuplicateItem[];
  busy: boolean;
  onApply: (choices: Record<string, DuplicateChoice>) => void;
  onClose: () => void;
};

const OPTIONS = [
  { value: "replace" as const, label: "Replace" },
  { value: "keep" as const, label: "Keep both" },
  { value: "skip" as const, label: "Skip" },
];

/** Every 409 conflict from one send, with Replace, Keep both or Skip per row and for all. */
export function DuplicateDialog({ open, periodLabel, items, busy, onApply, onClose }: Props) {
  const [choices, setChoices] = useState<Record<string, DuplicateChoice>>({});

  // Each opening starts from Skip, which keeps what's saved.
  useEffect(() => {
    if (open) setChoices(Object.fromEntries(items.map((d) => [String(d.id), "skip" as const])));
  }, [open, items]);

  // Replace all skips the rows that can't be replaced (someone else's or an approved entry).
  const setAll = (choice: DuplicateChoice) =>
    setChoices(choice === "replace" ? replaceWhereAllowed(items, choices) : Object.fromEntries(items.map((d) => [String(d.id), choice])));
  const replacing = Object.values(choices).filter((c) => c === "replace").length;
  const keeping = Object.values(choices).filter((c) => c === "keep").length;
  const doing = [replacing > 0 && `replace ${replacing}`, keeping > 0 && `keep both ${keeping}`].filter(Boolean).join(", ");

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`${items.length} ${items.length === 1 ? "row is" : "rows are"} already entered for ${periodLabel}`}
      description="Replace swaps the saved entry for the new one; you can't replace an entry someone else made or one already approved. Keep both saves the new one as another entry, for a second bill in the same month; your Manager sees the two as a possible duplicate. Skip keeps the saved entry and drops the new one."
      primaryAction={{
        label: doing ? `Apply (${doing})` : "Apply (skip all)",
        onClick: () => onApply(choices),
        loading: busy,
      }}
      cancelLabel="Decide later"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Apply to all:</span>
        <Button size="sm" variant="secondary" onClick={() => setAll("replace")} disabled={busy}>
          Replace all
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setAll("keep")} disabled={busy}>
          Keep both for all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAll("skip")} disabled={busy}>
          Skip all
        </Button>
      </div>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-control border border-line">
        {items.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium text-ink">{d.label}</p>
              <p className="text-xs text-muted">
                New: {d.tco2e !== null ? <span className="font-num">{formatNumber(d.tco2e, 2)} tCO₂e</span> : "—"}
                {d.existing && (
                  <>
                    {" · Saved: "}
                    {d.existing.tco2e !== null ? <span className="font-num">{formatNumber(d.existing.tco2e, 2)} tCO₂e</span> : "—"}
                    {d.existing.status && ` (${d.existing.status.charAt(0).toUpperCase()}${d.existing.status.slice(1)})`}
                    {enteredByText(d.existing) && ` · ${enteredByText(d.existing)}`}
                  </>
                )}
              </p>
              {!d.existing && <p className="text-xs text-muted">{d.message}</p>}
              {replaceBlocked(d.existing) && <p className="text-xs text-muted">{replaceBlocked(d.existing)} Keep both or skip.</p>}
            </div>
            <SegmentedControl
              size="sm"
              label={`${d.label}: replace, keep both or skip`}
              options={replaceBlocked(d.existing) ? OPTIONS.map((o) => (o.value === "replace" ? { ...o, disabled: true } : o)) : OPTIONS}
              value={choices[String(d.id)] ?? "skip"}
              onChange={(v) => setChoices((c) => ({ ...c, [String(d.id)]: v }))}
            />
          </li>
        ))}
      </ul>
    </Modal>
  );
}

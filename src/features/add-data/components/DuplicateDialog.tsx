import { useEffect, useState } from "react";
import { Button, Modal, SegmentedControl, formatNumber } from "../../../ui";

export type DuplicateChoice = "replace" | "skip";

export type DuplicateItem = {
  id: number | string;
  /** "Row 2 · Diesel" */
  label: string;
  tco2e: number | null;
  /** The server's 409 message. */
  message: string;
  /** The saved entry it collides with, when the server sent it. */
  existing: { tco2e: number | null; status: string | null } | null;
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
  { value: "skip" as const, label: "Skip" },
];

/** Every 409 conflict from one send, with Replace or Skip per row and both for all. */
export function DuplicateDialog({ open, periodLabel, items, busy, onApply, onClose }: Props) {
  const [choices, setChoices] = useState<Record<string, DuplicateChoice>>({});

  // Each opening starts from Skip, which keeps what's saved.
  useEffect(() => {
    if (open) setChoices(Object.fromEntries(items.map((d) => [String(d.id), "skip" as const])));
  }, [open, items]);

  const setAll = (choice: DuplicateChoice) => setChoices(Object.fromEntries(items.map((d) => [String(d.id), choice])));
  const replacing = Object.values(choices).filter((c) => c === "replace").length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`${items.length} ${items.length === 1 ? "row is" : "rows are"} already entered for ${periodLabel}`}
      description="Replace swaps the saved entry for the new one. Skip keeps the saved entry and drops the new one."
      primaryAction={{
        label: replacing > 0 ? `Apply (replace ${replacing})` : "Apply (skip all)",
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
                  </>
                )}
              </p>
              {!d.existing && <p className="text-xs text-muted">{d.message}</p>}
            </div>
            <SegmentedControl
              size="sm"
              label={`${d.label}: replace or skip`}
              options={OPTIONS}
              value={choices[String(d.id)] ?? "skip"}
              onChange={(v) => setChoices((c) => ({ ...c, [String(d.id)]: v }))}
            />
          </li>
        ))}
      </ul>
    </Modal>
  );
}

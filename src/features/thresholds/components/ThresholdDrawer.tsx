import { useState } from "react";
import { Button, Callout, Drawer, NumberField, cn, focusRing } from "../../../ui";
import { DEFAULT_THRESHOLD, MAX_THRESHOLD, MIN_THRESHOLD, STEP, type ThresholdRow, effectiveValue, formatPct, roundPct, snapPct, validateThreshold } from "../logic";

type Props = {
  row: ThresholdRow | null;
  /** A linked client (?open=id) whose data is still loading. */
  loading?: boolean;
  saving: boolean;
  resetting: boolean;
  /** Server error from the last save or reset. */
  error: string | null;
  onClose: () => void;
  onSave: (value: number) => void;
  onReset: () => void;
};

/** Slider plus number field for one client's threshold. Mount with `key` per client. */
export function ThresholdDrawer({ row, loading, saving, resetting, error, onClose, onSave, onReset }: Props) {
  const [value, setValue] = useState<number | null>(() => (row ? effectiveValue(row) : DEFAULT_THRESHOLD));
  const [touched, setTouched] = useState(false);

  if (loading) return <Drawer open loading onClose={onClose} title="Loading client…" />;
  if (!row) return <Drawer open={false} onClose={onClose} title="" />;

  const busy = saving || resetting;
  const invalid = validateThreshold(value);
  // Saving the default for a client on the default still pins it, so that counts as a change.
  const dirty = !row.threshold || value !== row.threshold.value;
  const save = () => {
    setTouched(true);
    if (!invalid && value !== null) onSave(value);
  };
  const sliderValue = value !== null && !invalid ? value : effectiveValue(row);

  return (
    <Drawer
      open
      size="sm"
      onClose={onClose}
      title={row.name}
      subtitle={row.threshold ? `Custom threshold · ${formatPct(row.threshold.value)}` : `Using the default ${DEFAULT_THRESHOLD}%`}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {row.threshold && (
            <Button onClick={onReset} loading={resetting} disabled={busy}>
              Use default {DEFAULT_THRESHOLD}%
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={busy || !dirty}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && dirty) save();
        }}
      >
        {error && (
          // Focus lands here so the message is read; the buttons are busy.
          <div key={error} ref={(el) => el?.focus()} tabIndex={-1} className="focus:outline-none">
            <Callout tone="warn" title="Couldn't save the threshold">
              {error}
            </Callout>
          </div>
        )}
        <p className="text-sm text-muted">
          An entry is flagged for review when a category's emissions change by more than this percentage against the previous period.
        </p>
        <div className="space-y-3">
          <input
            type="range"
            aria-label="Threshold percentage"
            min={MIN_THRESHOLD}
            max={MAX_THRESHOLD}
            step={STEP}
            value={sliderValue}
            aria-valuetext={formatPct(sliderValue)}
            onChange={(e) => setValue(roundPct(Number(e.target.value)))}
            disabled={busy}
            className={cn("w-full accent-accent", focusRing)}
          />
          <div className="flex justify-between font-num text-xs text-muted" aria-hidden>
            <span>{MIN_THRESHOLD}%</span>
            <span>{MAX_THRESHOLD}%</span>
          </div>
          <NumberField
            label="Threshold"
            unit="%"
            value={value}
            onChange={(v) => setValue(snapPct(v))}
            min={MIN_THRESHOLD}
            max={MAX_THRESHOLD}
            step={STEP}
            disabled={busy}
            help={`Between ${MIN_THRESHOLD.toFixed(2)}% and ${MAX_THRESHOLD.toFixed(2)}%, in steps of ${STEP}.`}
            error={touched ? invalid : undefined}
          />
        </div>
      </form>
    </Drawer>
  );
}

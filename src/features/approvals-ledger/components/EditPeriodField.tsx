import { editedDate, monthBounds } from "../../../lib/emissions";
import { useFyStartMonth } from "../../../lib/fiscalYear";
import { MonthPicker } from "../../../ui";
import { type LedgerRow, rowPeriodLabel } from "../logic";

/**
 * The entry's period in the edit form, with My entries' rules: a monthly entry
 * moves within its own year (the backend recalculates with the stored date's
 * factor year) and is saved on the new month's last day, as Add data saves it;
 * a yearly entry's period is shown, not edited. `value` and `onChange` are the
 * stored date ("YYYY-MM-DD").
 */
export function EditPeriodField({ row, value, onChange }: { row: LedgerRow; value: string; onChange: (date: string) => void }) {
  const fyStartMonth = useFyStartMonth();
  if (row.reporting_period === "yearly")
    return (
      <div className="text-sm">
        <span className="block text-xs font-medium text-muted">Period</span>
        <span className="mt-2 block text-ink">Yearly · {rowPeriodLabel(row, fyStartMonth)}</span>
      </div>
    );
  return (
    <MonthPicker
      label="Reporting month"
      required
      help="Within the same year, saved as the month's last day."
      value={value.slice(0, 7)}
      onChange={(m) => m && onChange(editedDate(row, m))}
      {...monthBounds(row)}
    />
  );
}

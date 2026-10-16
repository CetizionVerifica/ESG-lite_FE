import { Modal, SkeletonTableRows } from "../../../../ui";
import { errorCode, errorMessage, usePreview } from "../api";
import { TotalsTable } from "./TotalsTable";

/** "Freeze base year": shows the per-category totals being frozen, then saves. Focus trapped, Esc closes (Modal). */
export function FreezeModal({
  open,
  companyId,
  year,
  yearType,
  moving,
  saving,
  saveError,
  onClose,
  onConfirm,
}: {
  open: boolean;
  companyId: number | null;
  year: number;
  yearType: "CY" | "FY";
  /** Moving an already frozen base year to another year. */
  moving: boolean;
  saving: boolean;
  saveError: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const preview = usePreview(companyId, year, yearType, open);
  const noData = errorCode(preview.error) === "BASE_YEAR_NO_DATA";
  const label = `${yearType === "FY" ? "FY" : ""}${year}`;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Freeze ${label} as the Scope 3 base year?`}
      description={
        moving
          ? "The base year moves to this year. ESGLite records this as a recalculation with your note."
          : "These approved Scope 3 totals are stored. Later changes to them are checked against your threshold."
      }
      primaryAction={{ label: "Freeze base year", onClick: onConfirm, loading: saving, disabled: !preview.data }}
      error={saveError}
    >
      {preview.isLoading ? (
        <SkeletonTableRows rows={4} columns={2} />
      ) : noData ? (
        <p className="text-sm text-bad" role="alert">
          {label} has no approved Scope 3 entries. Pick a year with approved data.
        </p>
      ) : preview.isError ? (
        <p className="text-sm text-bad" role="alert">{errorMessage(preview.error, "Couldn't load the totals. Try again.")}</p>
      ) : preview.data ? (
        <>
          <TotalsTable caption={`Scope 3 totals for ${label}`} totals={preview.data.categories} />
          <p className="mt-2 text-xs text-muted">
            {preview.data.rows} approved {preview.data.rows === 1 ? "entry" : "entries"}.
          </p>
        </>
      ) : null}
    </Modal>
  );
}

import { Callout } from "../../../ui";
import { usePeriodMode } from "../api";
import type { EntryPeriod } from "../logic/entry";
import { periodLockTitle } from "../logic/periodLock";

/**
 * F-13/F-27: the period is already filed the other way (monthly vs yearly) on this site and
 * category, said at the top of step 2 before anything is typed, in the save's own words. The
 * title names the clash the save found (#246): monthly entries, or the other calendar's yearly data.
 */
export function PeriodModeNote({ siteId, categoryId, period }: { siteId: number; categoryId: number; period: EntryPeriod }) {
  const answer = usePeriodMode(siteId, categoryId, period).data;
  const message = answer?.message ?? null;
  if (!message) return null;
  return (
    <Callout tone="warn" title={periodLockTitle(period.mode, answer?.conflict)}>
      {message}
    </Callout>
  );
}

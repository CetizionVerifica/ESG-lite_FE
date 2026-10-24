import { Callout } from "../../../ui";
import { usePeriodMode } from "../api";
import type { EntryPeriod } from "../logic/entry";

/**
 * F-13/F-27: the period is already filed the other way (monthly vs yearly) on this site and
 * category, said at the top of step 2 before anything is typed, in the save's own words.
 */
export function PeriodModeNote({ siteId, categoryId, period }: { siteId: number; categoryId: number; period: EntryPeriod }) {
  const message = usePeriodMode(siteId, categoryId, period).data?.message ?? null;
  if (!message) return null;
  return (
    <Callout tone="warn" title={period.mode === "yearly" ? "Filed monthly for this year" : "Filed yearly for this period"}>
      {message}
    </Callout>
  );
}

import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Query key roots whose data is derived from emission entries. Any change to an
 * entry (save, approve, reject, edit, delete) makes all of them stale, whichever
 * page made the change.
 */
export const EMISSION_QUERY_ROOTS: readonly QueryKey[] = [
  ["overview"],
  ["my-month"],
  ["my-entries"],
  ["approvals-ledger"],
  ["ghg-report"],
  ["ede-report"],
  ["targets"],
  ["add-data", "existing"],
  ["add-data", "period-total"],
];

/** Marks every emission-derived query stale; the ones on screen refetch. */
export function invalidateEmissionQueries(client: QueryClient): Promise<void> {
  return Promise.all(EMISSION_QUERY_ROOTS.map((queryKey) => client.invalidateQueries({ queryKey }))).then(() => undefined);
}

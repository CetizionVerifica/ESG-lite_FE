import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ManagerUser, getManagerUsers, updateUserCategories } from "../../services/managerService";
import { type SubmissionUser, getSubmissionStatus } from "../../services/overviewService";
import { isContributor } from "./logic";

export const keys = {
  all: ["team-access"] as const,
  users: () => [...keys.all, "users"] as const,
  month: (month: string) => [...keys.all, "submission", month] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

/** The contributors on the manager's sites, with category access per site (the server lists only them; older servers sent everyone). */
export function useTeam() {
  return useQuery<ManagerUser[], Error, ManagerUser[]>({ queryKey: keys.users(), queryFn: getManagerUsers, select: (users) => users.filter(isContributor) });
}

/** Who has submitted for a month. Only feeds the "This month" column, so a failure just blanks it. */
export function useMonthStatus(month: string) {
  return useQuery<SubmissionUser[]>({ queryKey: keys.month(month), queryFn: () => getSubmissionStatus(month), retry: 1 });
}

export function useSaveAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, categoryIds }: { userId: number; categoryIds: number[] }) => updateUserCategories(userId, categoryIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users() }),
  });
}

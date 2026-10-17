// SE-1 hooks: showCalcDetail for the signed-in person (see ./entryDetail.ts).
import { useAuth } from "../context/AuthContext";
import { companyOfUserSite, showCalcDetail, type DetailCompany } from "./entryDetail";

/** showCalcDetail for the signed-in person and the company of the site being worked on. */
export function useCalcDetail(company?: DetailCompany): boolean {
  const { role } = useAuth();
  return showCalcDetail(role, company);
}

/** useCalcDetail for a site of the signed-in user (My entries, bulk upload). */
export function useCalcDetailForSite(siteId?: number | null): boolean {
  const { role, user } = useAuth();
  return showCalcDetail(role, companyOfUserSite(user, siteId));
}

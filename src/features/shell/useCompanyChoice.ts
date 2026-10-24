import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { type CompanyOption, companiesOf } from "../../lib/activeCompany";

/**
 * M6: for someone with sites at several clients, the companies they can work in, the current one
 * (the chosen one, else their first site's) and `choose`, which switches and refetches every query.
 * `companies` is empty for everyone else, and the menus show no choice.
 */
export function useCompanyChoice(): { companies: CompanyOption[]; current: number | null; choose: (companyId: number) => void } {
  const { user, activeCompanyId, setActiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companies = companiesOf(user);
  const first = (user?.company?.company_id ?? user?.site?.company?.company_id ?? user?.sites?.[0]?.company?.company_id ?? null) as number | null;
  return {
    companies: companies.length > 1 ? companies : [],
    current: activeCompanyId ?? first,
    choose: (companyId: number) => {
      setActiveCompany(companyId);
      void queryClient.invalidateQueries();
    },
  };
}

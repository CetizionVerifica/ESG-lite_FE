import { useQuery } from "@tanstack/react-query";
import { KpiGate } from "../../../lib/kpi/KpiGate";
import { useKpiCompanyId } from "../../../lib/kpi/switch";
import { ModuleSlot } from "../../../routes/ModuleSlot";
import { hasModuleSlot } from "../../../routes/moduleSlots";
import { getKpiSetup, getKpiValues } from "../../../services/kpiService";
import { ContextChips, PageHeader, Tabs } from "../../../ui";

/**
 * D18 · Approvals for a Superadmin: only the KPIs tab (review, approve,
 * reject, close and reopen a period) for the chosen client. Emissions
 * approvals stay with the client's Managers. Without a client the page asks
 * for one; with the client's switch off it says so.
 */
export function StaffKpiApprovals() {
  return (
    <KpiGate staff home="/clients">
      {hasModuleSlot("approvals-kpi") ? <ClientKpiApprovals /> : null}
    </KpiGate>
  );
}

function ClientKpiApprovals() {
  const companyId = useKpiCompanyId();
  // The client's sites come with its setup (the Superadmin has no sites of their own).
  const setup = useQuery({ queryKey: ["kpi", "setup", companyId], queryFn: () => getKpiSetup(companyId), staleTime: 60_000 });
  const pending = useQuery({ queryKey: ["kpi", "review", "pending", companyId], queryFn: () => getKpiValues({ status: "pending" }, companyId), staleTime: 15_000, retry: false });
  const sites = (setup.data?.sites ?? []).map((s) => ({ value: s.site_id, label: s.name }));
  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        description="KPI values from this client's sites, reviewed the same way as emissions."
        context={<ContextChips chips={["site", "period"]} sites={sites} periodKinds={["month"]} allowAnyPeriod />}
      />
      <Tabs<"kpi"> label="Approvals views" value="kpi" onChange={() => undefined} items={[{ value: "kpi", label: "KPIs", count: pending.data?.length }]} />
      <ModuleSlot id="approvals-kpi" />
    </div>
  );
}

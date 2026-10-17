import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useKpiCompanyId } from "../../../lib/kpi/switch";
import { kpiErrorMessage, refreshAutoKpis } from "../../../services/kpiService";
import { Button, useToast } from "../../../ui";
import { canRefreshAuto, refreshSummary } from "./refresh";

/**
 * KPI-5 · "Refresh from your data": reads every auto value of the year again
 * from the approved rows (D9: fix the source, the KPI follows). Manager and
 * above only; renders nothing for other roles.
 */
export function RefreshFromDataButton({ year, size = "md", variant = "secondary" }: { year: number; size?: "sm" | "md"; variant?: "secondary" | "ghost" }) {
  const { role } = useAuth();
  const companyId = useKpiCompanyId();
  const qc = useQueryClient();
  const { toast } = useToast();
  const refresh = useMutation({
    mutationFn: () => refreshAutoKpis(year, companyId),
    onSuccess: (r) => {
      toast({ ...refreshSummary(r), tone: "good" });
      void qc.invalidateQueries({ queryKey: ["kpi"], refetchType: "active" });
    },
    onError: (e) => toast({ title: "Couldn't refresh from your data", description: kpiErrorMessage(e, "Nothing was changed. Try again in a moment."), tone: "bad" }),
  });
  if (!canRefreshAuto(role)) return null;
  return (
    <Button
      size={size}
      variant={variant}
      loading={refresh.isPending}
      icon={<RefreshCw aria-hidden className="size-4" />}
      title="Read emissions, energy and production figures again from approved rows"
      onClick={() => refresh.mutate()}
    >
      Refresh from your data
    </Button>
  );
}

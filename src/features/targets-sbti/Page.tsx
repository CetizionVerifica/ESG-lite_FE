import { type ReactNode, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, FileDown, FileSpreadsheet, SearchX } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { pdfTheme, useTheme } from "../../theme";
import {
  Button,
  ContextChips,
  EmptyState,
  type Kpi,
  KpiStrip,
  PageHeader,
  SegmentedControl,
  Select,
  formatNumber,
  useContextParams,
  useToast,
} from "../../ui";
import { useTarget, useYearsWithData } from "./api";
import { PathwayChart } from "./components/PathwayChart";
import { RulesCard } from "./components/RulesCard";
import { TargetStatus, TargetTabs } from "./components/TargetTabs";
import {
  PATHWAYS,
  type Horizon,
  type Pathway,
  type Setup,
  type TargetKind,
  baseYearOptions,
  isNoBaseData,
  latestScored,
  readSetup,
  rulesCheck,
  targetYearOf,
  writeSetup,
  yearsLeft,
} from "./logic";

type SiteOption = { site_id: number; name: string };

function useManagerSites(): SiteOption[] {
  const { user } = useAuth();
  return useMemo(() => {
    const list = (user?.sites as SiteOption[] | undefined) ?? [];
    return list.length > 0 ? list : user?.site ? [user.site as SiteOption] : [];
  }, [user]);
}

const LOAD_ERROR = "Couldn't calculate the target.";

/**
 * P12 `/targets`: set a science-based target and see, every year, whether
 * the chosen sites are on the pathway. One page; the setup lives in the URL.
 */
export default function TargetsPage() {
  const now = useMemo(() => new Date(), []);
  const sites = useManagerSites();
  const [ctx] = useContextParams();
  const [params, setParams] = useSearchParams();
  const setup = readSetup(params, now);
  const update = (patch: Partial<Setup>) => setParams((p) => writeSetup(p, patch), { replace: true });
  const { pack } = useTheme();
  const { toast } = useToast();
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);

  // No site chosen = all of the manager's sites; ids from the URL that aren't theirs are dropped.
  const chosen = useMemo(() => {
    const valid = ctx.siteIds.filter((id) => sites.some((s) => s.site_id === id));
    return valid.length ? valid : sites.map((s) => s.site_id);
  }, [ctx.siteIds, sites]);
  const siteNames = sites.filter((s) => chosen.includes(s.site_id)).map((s) => s.name);
  const targetYear = targetYearOf(setup);

  const target = useTarget({ kind: setup.kind, siteIds: chosen, baseYear: setup.baseYear, targetYear, pathway: setup.pathway });
  const noData = target.isError && isNoBaseData(target.error);
  const otherYears = useMemo(() => baseYearOptions(now).filter((y) => y !== setup.baseYear), [now, setup.baseYear]);
  const suggestions = useYearsWithData(otherYears, chosen, noData);

  // While a new setup loads, keepPreviousData holds the last result: show the skeleton, not stale figures.
  const loading = target.isPending || target.isPlaceholderData;
  const model = !loading && target.isSuccess ? target.data : undefined;
  const error = target.isError && !noData ? LOAD_ERROR : null;
  const rules = model ? rulesCheck({ model, pathway: setup.pathway, chosenSites: chosen.length, totalSites: sites.length }) : null;

  if (sites.length === 0)
    return (
      <div className="space-y-6">
        <PageHeader title="Targets" />
        <EmptyState icon={Building2} title="You don't manage any sites yet." description="Ask your admin to assign one." />
      </div>
    );

  const latest = model ? latestScored(model.actual) : null;
  const kpis: Kpi[] = [
    { label: `Base emissions ${setup.baseYear}`, value: model?.boundaryBase, format: "emissions", hint: model && (model.scope3Required ? "Scope 1+2+3" : "Scope 1+2") },
    { label: `Target ${targetYear}`, value: model?.targetEmissions, format: "emissions", previous: model?.boundaryBase, compareLabel: "vs base year", primary: true },
    {
      label: "Latest actual vs pathway",
      value: latest?.actual ?? null,
      format: "emissions",
      previous: latest?.target,
      compareLabel: latest ? `vs ${latest.year} pathway` : undefined,
      hint: model && (latest ? <TargetStatus status={latest.status} /> : "No approved actuals after the base year yet"),
    },
    { label: "Annual rate", value: model?.annualRatePct, format: "percent", decimals: 1, hint: model && "compounding reduction" },
    { label: "Years left", value: model ? yearsLeft(targetYear, now) : null, format: "number", hint: model && `to ${targetYear}` },
  ];

  const runExport = async (kind: "pdf" | "xlsx") => {
    if (!model || !rules) return;
    setExporting(kind);
    try {
      const { exportPdf, exportXlsx } = await import("./export");
      if (kind === "xlsx") await exportXlsx(model, siteNames, setup.pathway);
      else await exportPdf({ theme: pdfTheme(pack), model, pathway: setup.pathway, siteNames, rules, generatedAt: new Date() });
    } catch {
      toast({ tone: "bad", title: kind === "pdf" ? "Couldn't create the PDF." : "Couldn't create the spreadsheet." });
    } finally {
      setExporting(null);
    }
  };

  const yearOptions = baseYearOptions(now).map((y) => ({ value: y, label: String(y) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Targets"
        description={siteNames.length === sites.length ? `All sites (${sites.length})` : siteNames.join(", ")}
        context={<ContextChips chips={["site"]} sites={sites.map((s) => ({ value: s.site_id, label: s.name }))} />}
        secondaryActions={[
          { label: "Export PDF", onClick: () => runExport("pdf"), icon: <FileDown aria-hidden className="size-4" />, disabled: !model, loading: exporting === "pdf" },
          { label: "Export XLSX", onClick: () => runExport("xlsx"), icon: <FileSpreadsheet aria-hidden className="size-4" />, disabled: !model, loading: exporting === "xlsx" },
        ]}
      />

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-card border border-line bg-panel p-4">
        <Select<number>
          label="Base year"
          help="2015 or later (SBTi)"
          value={setup.baseYear}
          onChange={(v) => v && update({ baseYear: v })}
          options={yearOptions}
          className="w-36"
        />
        <Control label="Target">
          <SegmentedControl<TargetKind>
            label="Target"
            value={setup.kind}
            onChange={(kind) => update({ kind })}
            options={[
              { value: "near", label: "Near-term" },
              { value: "netzero", label: "Net-zero 2050" },
            ]}
          />
        </Control>
        {setup.kind === "near" && (
          <>
            <Control label="Horizon">
              <SegmentedControl<"5" | "10">
                label="Horizon"
                value={String(setup.horizon) as "5" | "10"}
                onChange={(h) => update({ horizon: Number(h) as Horizon })}
                options={[
                  { value: "5", label: `5 yrs · ${setup.baseYear + 5}` },
                  { value: "10", label: `10 yrs · ${setup.baseYear + 10}` },
                ]}
              />
            </Control>
            <Control label="Pathway">
              <SegmentedControl<Pathway>
                label="Pathway"
                value={setup.pathway}
                onChange={(pathway) => update({ pathway })}
                options={(Object.keys(PATHWAYS) as Pathway[]).map((p) => ({
                  value: p,
                  label: `${PATHWAYS[p].short} · ${formatNumber(PATHWAYS[p].rate * 100, 1)}%/yr`,
                }))}
              />
            </Control>
          </>
        )}
      </div>

      {noData ? (
        <EmptyState
          icon={SearchX}
          title={`No data for base year ${setup.baseYear}`}
          description={
            suggestions.pending
              ? "Looking for years with approved emissions…"
              : suggestions.years.length
                ? "These years have approved emissions on the chosen sites:"
                : "No year since 2015 has approved emissions on the chosen sites yet."
          }
          action={
            suggestions.years.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.years.slice(0, 6).map((y) => (
                  <Button key={y} size="sm" variant="secondary" onClick={() => update({ baseYear: y })}>
                    Use {y}
                  </Button>
                ))}
              </div>
            )
          }
        />
      ) : (
        <>
          <KpiStrip items={kpis} loading={loading} error={error} onRetry={() => target.refetch()} />
          <div className="grid gap-6 lg:grid-cols-3">
            <PathwayChart className="min-w-0 lg:col-span-2" model={model} loading={loading} error={error} onRetry={() => target.refetch()} />
            <RulesCard rules={rules} loading={loading} error={error} onRetry={() => target.refetch()} />
          </div>
          {model && <TargetTabs model={model} tab={setup.tab} onTab={(tab) => update({ tab })} />}
        </>
      )}
    </div>
  );
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <span aria-hidden className="block text-xs font-medium text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

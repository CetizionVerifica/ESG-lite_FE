import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, FlaskConical, Package, Plus, SearchX } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  Button,
  Callout,
  ContextChips,
  DataTable,
  DEFAULT_FY_START_MONTH,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  type FilterDef,
  type Kpi,
  KpiStrip,
  PageHeader,
  type Period,
  cn,
  exportMatrix,
  focusRing,
  periodLabel,
  periodRange,
  serializePeriod,
  toMatrix,
  useContextParams,
  useFilterParams,
  useToast,
  writeFilterParams,
} from "../../ui";
import { errorMessage, useApprovedProduction, useReconciliation, useSiteProducts, useStudies } from "./api";
import { footprintColumns } from "./components/columns";
import {
  type Focus,
  type FootprintRow,
  ROW_STATUSES,
  STATUS_LABEL,
  asFocus,
  buildRows,
  computeKpis,
  inFocus,
  insightLines,
  matchesFilters,
} from "./logic";

type SiteOption = { site_id: number; name: string; company?: { company_id: number; name: string } };

function useManagerSites(): SiteOption[] {
  const { user } = useAuth();
  return useMemo(() => {
    const list = (user?.sites as SiteOption[] | undefined) ?? [];
    return list.length > 0 ? list : user?.site ? [user.site as SiteOption] : [];
  }, [user]);
}

const FILTER_KEYS = ["status", "pcr"];
const FOCUS = "kpi";
const FY_START_MONTH = DEFAULT_FY_START_MONTH;

/** Footprints are made for a finished year, so the page opens on last calendar year. */
function defaultYear(now: Date): Period {
  return { kind: "cy", year: now.getFullYear() - 1 };
}

const startLink = (r: FootprintRow) => `/products/new?product=${r.product_id}&site=${r.site_id}`;

/**
 * C01 `/products`: which products have a footprint a customer can use, which
 * are out of date, and which to do next.
 */
export default function ProductFootprintsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const sites = useManagerSites();
  const now = useMemo(() => new Date(), []);
  const fallback = useMemo(() => defaultYear(now), [now]);
  const [ctx] = useContextParams({ period: fallback });
  // Only calendar and fiscal years: a footprint covers a reporting year.
  const period = ctx.period && (ctx.period.kind === "cy" || ctx.period.kind === "fy") ? ctx.period : fallback;
  const { from, to } = periodRange(period, FY_START_MONTH);
  const year = periodLabel(period, FY_START_MONTH);
  const managed = sites.map((s) => s.site_id);
  const chosen = ctx.siteIds.filter((id) => managed.includes(id));
  const scopeSites = chosen.length ? chosen : managed;

  const products = useSiteProducts(scopeSites);
  const studies = useStudies(scopeSites);
  const production = useApprovedProduction(scopeSites, from, to);
  const recon = useReconciliation(scopeSites, from, to);

  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);
  const focus = asFocus(params.get(FOCUS));

  const all = useMemo(
    () =>
      products.data && studies.data
        ? buildRows({ products: products.data, studies: studies.data, production: production.data ?? [], from, to })
        : [],
    [products.data, studies.data, production.data, from, to],
  );
  const allocatedIds = useMemo(() => new Set((recon.data ?? []).flatMap((r) => r.products.map((p) => p.product_id))), [recon.data]);
  const f = filters.filters;
  const statuses = f.status ?? [];
  const pcr = f.pcr ?? [];
  const rows = useMemo(
    () =>
      all.filter(
        (r) => matchesFilters(r, { q: filters.q, statuses: f.status ?? [], pcr: f.pcr ?? [] }) && (!focus || inFocus(r, focus, allocatedIds)),
      ),
    [all, filters.q, f, focus, allocatedIds],
  );
  const kpis = computeKpis(all, recon.data ?? null);

  const setFocus = (f: Focus) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (focus === f) next.delete(FOCUS);
      else next.set(FOCUS, f);
      return next;
    }, { replace: true });
  const clearFilters = () =>
    setParams((p) => {
      const next = writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS);
      next.delete(FOCUS);
      return next;
    }, { replace: true });

  const columns = footprintColumns({ startLink, showSite: scopeSites.length > 1 });
  const exportRows = async (selected: FootprintRow[]) => {
    try {
      await exportMatrix(toMatrix(selected, columns), "product-footprints-selected", "csv");
    } catch {
      toast({ title: "Couldn't export", description: "Try again in a moment.", tone: "bad" });
    }
  };

  const company = sites[0]?.company?.name ?? null;
  const siteName = (id: number) => sites.find((s) => s.site_id === id)?.name;
  const productionLink = (() => {
    const q = new URLSearchParams({ period: serializePeriod(period), status: "approved" });
    if (chosen.length) q.set("site", [...chosen].sort((a, b) => a - b).join(","));
    return `/data/production?${q.toString()}`;
  })();

  const header = (
    <PageHeader
      title="Product footprints"
      crumb={company ? [{ label: company }, { label: "Products" }] : undefined}
      description={`Cradle-to-gate footprints per product for ${year}.`}
      context={
        <ContextChips
          chips={["site", "period"]}
          sites={sites.map((s) => ({ value: s.site_id, label: s.name }))}
          periodKinds={["cy", "fy"]}
          fyStartMonth={FY_START_MONTH}
          defaults={{ period: fallback }}
        />
      }
      primaryAction={{
        label: "New footprint",
        icon: <Plus aria-hidden className="size-4" />,
        onClick: () => navigate(scopeSites.length === 1 ? `/products/new?site=${scopeSites[0]}` : "/products/new"),
      }}
      secondaryActions={[{ label: "Material factors", icon: <FlaskConical aria-hidden className="size-4" />, onClick: () => navigate("/factors/materials") }]}
    />
  );

  if (sites.length === 0)
    return (
      <div className="space-y-4">
        {header}
        <EmptyState icon={Building2} title="You don't manage any sites yet." description="Ask your admin to assign one." />
      </div>
    );

  if (products.data && products.data.length === 0)
    return (
      <div className="space-y-4">
        {header}
        <EmptyState icon={Package} title="Ask your admin to add products." description="Footprints start from the products set up for your sites." />
      </div>
    );

  const kpiItems: Kpi[] = [
    {
      label: "Products footprinted",
      value: kpis.footprinted,
      unit: `of ${kpis.withProduction}`,
      hint: kpis.outOfDate ? `${kpis.outOfDate} out of date` : "Of products with approved production",
      primary: true,
      onSelect: () => setFocus("footprinted"),
      selected: focus === "footprinted",
    },
    {
      label: "Production covered",
      value: kpis.coveredPct,
      format: "percent",
      decimals: 0,
      hint: kpis.mixedUnits && kpis.withProduction > 0 ? "Products use different units" : "By approved volume",
      onSelect: () => setFocus("covered"),
      selected: focus === "covered",
    },
    {
      label: "Plant energy allocated",
      value: kpis.allocatedPct,
      format: "percent",
      decimals: 0,
      hint: recon.error ? "Couldn't load the plant total" : `Plant Scope 1+2, ${year}`,
      onSelect: () => setFocus("allocated"),
      selected: focus === "allocated",
    },
    {
      label: "Primary data share",
      value: kpis.primaryPct,
      format: "percent",
      decimals: 0,
      hint: kpis.primaryHidden ? `${kpis.primaryHidden} hidden by licensed data` : "Weighted by emissions",
      onSelect: () => setFocus("primary"),
      selected: focus === "primary",
    },
  ];

  const tableError = products.error ?? studies.error;
  const loaded = !!products.data && !!studies.data;
  const noProduction = loaded && !!production.data && production.data.length === 0;
  const insights = loaded ? insightLines(all, recon.data ?? null, siteName) : [];
  const filtered = !!filters.q.trim() || statuses.length > 0 || pcr.length > 0 || !!focus;

  const filterDefs: FilterDef[] = [
    { key: "status", label: "Status", options: ROW_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
    {
      key: "pcr",
      label: "PCR",
      options: [...new Set(all.map((r) => r.pcr_tag ?? "—"))].sort().map((v) => ({ value: v, label: v === "—" ? "No PCR" : v })),
    },
  ];

  return (
    <div className="space-y-4">
      {header}
      <KpiStrip
        items={kpiItems}
        loading={!loaded || production.isPending}
        error={production.error ? errorMessage(production.error, "Couldn't load approved production.") : null}
        onRetry={production.refetch}
      />
      {noProduction && (
        <Callout
          tone="warn"
          title={`No approved production for ${year}`}
          action={
            <Link to={productionLink} className={cn("rounded-chip text-sm font-medium text-brand-text underline underline-offset-2", focusRing)}>
              Review production data
            </Link>
          }
        >
          Plant energy (A3) is shared out by production, so footprints for this year need approved production data.
        </Callout>
      )}
      {insights.length > 0 && <Callout tone="brand">{insights.join(" ")}</Callout>}
      <DataTable<FootprintRow>
        label="Product footprints"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.product_id}
        rowLabel={(r) => r.product_name}
        loading={!loaded && !tableError}
        error={tableError ? errorMessage(tableError, "Couldn't load product footprints.") : null}
        onRetry={() => {
          products.refetch();
          studies.refetch();
        }}
        empty={
          <EmptyState
            icon={SearchX}
            title="No products match these filters."
            action={filtered ? <Button onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        }
        defaultSort={{ id: "product", dir: "asc" }}
        selectable
        bulkActions={(selected) => (
          <Button size="sm" onClick={() => void exportRows(selected)}>
            Export CSV
          </Button>
        )}
        pagination={{ mode: "client", pageSize: 50 }}
        onRowClick={(r) => navigate(r.study ? `/products/${r.study.pcf_study_id}` : startLink(r))}
        exportName="product-footprints"
        storageKey="c01-product-footprints"
        toolbar={
          <FilterBar
            filters={filterDefs}
            value={filters}
            onChange={setFilters}
            loading={!loaded}
            searchPlaceholder="Search products"
            searchDelay={0}
          />
        }
      />
    </div>
  );
}

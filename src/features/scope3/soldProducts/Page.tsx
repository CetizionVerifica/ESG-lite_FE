import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Plus, Upload } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useClientContext } from "../../../lib/clientContext";
import { categoryLabel } from "../../../lib/scope3/contracts";
import type { PlanBody, Sale, SoldProduct, SoldProductCategory, YearType } from "../../../services/scope3SoldProductsService";
import {
  Badge,
  Button,
  Callout,
  type Column,
  DataTable,
  EmptyState,
  PageHeader,
  SegmentedControl,
  Select,
  YearPicker,
  cn,
  exportMatrix,
  focusRing,
  formatNumber,
  panel,
  useToast,
} from "../../../ui";
import { errorMessage, usePlanSoldProducts, useSales } from "./api";
import { ImportDrawer } from "./components/ImportDrawer";
import { PlanDrawer } from "./components/PlanDrawer";
import { ProductDrawer } from "./components/ProductDrawer";
import { SaleDrawer } from "./components/SaleDrawer";
import { SALES_HEADERS, TEMPLATE_ROWS, TREATMENT_LABEL, USE_TYPE_LABEL, monthLabel } from "./logic";

const YEAR_TYPE_OPTIONS = [
  { value: "CY" as const, label: "Calendar year" },
  { value: "FY" as const, label: "Financial year" },
];
const CATEGORIES: SoldProductCategory[] = [10, 11, 12];
const fmt = (n: number) => formatNumber(n, n % 1 ? 2 : 0);

const SALE_COLUMNS: Column<Sale>[] = [
  { id: "product", header: "Product", value: (s) => s.product, sortable: true, hideable: false },
  { id: "month", header: "Month", value: (s) => s.period, cell: (s) => monthLabel(s.period), sortable: true, width: "7rem" },
  { id: "quantity", header: "Quantity", value: (s) => s.quantity, numeric: true, sortable: true, cell: (s) => fmt(s.quantity) },
  { id: "unit", header: "Unit", value: (s) => s.unit, width: "5rem" },
  { id: "region", header: "Region", value: (s) => s.region ?? "", cell: (s) => s.region ?? <span className="text-muted">None</span> },
  {
    id: "mass",
    header: "Mass (kg)",
    value: (s) => s.mass_kg,
    numeric: true,
    sortable: true,
    cell: (s) => (s.mass_kg === null ? <span className="text-warn">Missing</span> : fmt(s.mass_kg)),
  },
];

const eolText = (p: SoldProduct) => (p.eol_mix?.length ? p.eol_mix.map((x) => `${fmt(x.share * 100)} % ${TREATMENT_LABEL[x.treatment].toLowerCase()}`).join(", ") : null);

const PRODUCT_COLUMNS: Column<SoldProduct>[] = [
  { id: "name", header: "Product", value: (p) => p.name, sortable: true, hideable: false },
  { id: "mass", header: "Mass per unit (kg)", value: (p) => p.mass_per_unit_kg, numeric: true, cell: (p) => (p.mass_per_unit_kg === null ? <span className="text-warn">Missing</span> : fmt(p.mass_per_unit_kg)) },
  { id: "lifetime", header: "Lifetime uses", value: (p) => p.lifetime_uses, numeric: true, cell: (p) => (p.lifetime_uses === null ? <span className="text-muted">None</span> : fmt(p.lifetime_uses)) },
  {
    id: "use",
    header: "Use",
    value: (p) => (p.use_profile?.use_type ? USE_TYPE_LABEL[p.use_profile.use_type] : ""),
    cell: (p) => (p.use_profile?.use_type ? USE_TYPE_LABEL[p.use_profile.use_type] : <span className="text-warn">Missing</span>),
  },
  { id: "eol", header: "End of life", value: (p) => eolText(p) ?? "", cell: (p) => eolText(p) ?? <span className="text-muted">Average</span>, wrap: true },
];

/**
 * S3-10 `/settings/scope3/sold-products`: what the company sold in the year,
 * per product and month, and the product data the plans need. Each "Create
 * Category n plan" makes an import plan for the chosen site; the engine
 * calculates every row and nothing is saved until Import.
 */
export default function SoldProductsPage() {
  const { role } = useAuth();
  const isStaff = role === "Superadmin";
  const { clientId } = useClientContext();
  const companyId = isStaff ? clientId : null;
  const ready = !isStaff || clientId !== null;
  const { toast } = useToast();
  const thisYear = new Date().getFullYear();

  // Site and year live in the URL so a link opens the same view.
  const [params, setParams] = useSearchParams();
  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams([...p].filter(([k]) => k !== key));
        if (value) next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const year = Number(params.get("year")) || thisYear;
  const yearType: YearType = params.get("year_type") === "FY" ? "FY" : "CY";

  const list = useSales(companyId, year, yearType, ready);
  const sites = useMemo(() => list.data?.sites ?? [], [list.data]);
  const siteParam = Number(params.get("site"));
  const site = sites.find((s) => s.site_id === siteParam) ?? (sites.length === 1 ? sites[0] : null);
  const products = useMemo(() => (list.data?.products ?? []).filter((p) => !site || p.site_id === site.site_id), [list.data, site]);
  const sales = useMemo(() => (list.data?.sales ?? []).filter((s) => !site || s.site_id === site.site_id), [list.data, site]);

  const [dialog, setDialog] = useState<"sale" | "import" | null>(null);
  const [editing, setEditing] = useState<SoldProduct | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [planBody, setPlanBody] = useState<PlanBody | null>(null);
  const plan = usePlanSoldProducts(companyId);

  const openPlan = (n: SoldProductCategory) => {
    if (!site) return;
    const body: PlanBody = { site_id: site.site_id, year, year_type: yearType, ghg_category: n };
    setPlanBody(body);
    plan.mutate(body);
  };

  const header = (
    <PageHeader
      title="Sold products"
      description={`Record what you sold each month. ESGLite turns it into rows for ${categoryLabel(10)}, ${categoryLabel(11)} and ${categoryLabel(12)}, using the product data you keep for footprints.`}
      primaryAction={ready && products.length ? { label: "Add sale", icon: <Plus size={16} aria-hidden />, onClick: () => setDialog("sale") } : undefined}
      secondaryActions={[
        ...(ready && products.length ? [{ label: "Import sales", icon: <Upload size={16} aria-hidden />, onClick: () => setDialog("import") }] : []),
        { label: "Download template", icon: <Download size={16} aria-hidden />, onClick: () => void exportMatrix([[...SALES_HEADERS], ...TEMPLATE_ROWS], "product-sales-template", "csv") },
      ]}
    />
  );

  if (!ready)
    return (
      <div className="space-y-6">
        {header}
        <Callout tone="warn" title="Pick a client first">
          Choose a client with the switcher at the top; sales are kept per client.
        </Callout>
      </div>
    );

  const yearLabel = yearType === "FY" ? `FY ${year}` : String(year);
  const planHint = (n: SoldProductCategory) => (!site ? "Choose a site first." : site.categories[n] ? null : `${site.name} has no ${categoryLabel(n)}.`);

  return (
    <div className="space-y-6">
      {header}

      <section className={cn(panel, "grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3")} aria-label="Year and site">
        <Select<number>
          label="Site"
          value={site?.site_id ?? null}
          options={sites.map((s) => ({ value: s.site_id, label: s.name }))}
          onChange={(v) => setParam("site", v ? String(v) : null)}
          placeholder="All your sites"
          loading={list.isLoading}
        />
        <YearPicker label="Reporting year" value={year} onChange={(v) => setParam("year", v ? String(v) : null)} yearType={yearType} from={2018} to={thisYear + 1} />
        <SegmentedControl<YearType>
          label="Year type"
          options={YEAR_TYPE_OPTIONS}
          value={yearType}
          onChange={(v) => setParam("year_type", v === "FY" ? "FY" : null)}
          size="sm"
          className="self-end"
        />
      </section>

      <section className={cn(panel, "space-y-3 p-4")} aria-label="Plans">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((n) => (
            <Button key={n} variant={n === 12 ? "primary" : "secondary"} disabled={!!planHint(n) || !sales.length} onClick={() => openPlan(n)}>
              Create Category {n} plan
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {site ? (CATEGORIES.map(planHint).find(Boolean) ?? `Plans use ${site.name}'s sales for ${yearLabel}.`) : "Choose a site to create a plan; each plan is for one site."}{" "}
          <Link to="/settings/scope3" className={cn(focusRing, "rounded-control font-medium text-brand hover:underline")}>
            Check the boundary
          </Link>
        </p>
      </section>

      <DataTable<Sale>
        label={`Sales for ${yearLabel}`}
        rows={sales}
        columns={SALE_COLUMNS}
        getRowId={(s) => s.id}
        loading={list.isLoading}
        error={list.isError ? errorMessage(list.error, "Couldn't load the sales.") : null}
        onRetry={() => list.refetch()}
        onRowClick={setEditingSale}
        defaultSort={{ id: "product", dir: "asc" }}
        exportName={`product-sales-${year}`}
        empty={
          <EmptyState
            title={`No sales recorded for ${yearLabel}`}
            description={products.length ? "Import a sheet of the year's sales, or add them one by one." : "No products on these sites yet. A Superadmin adds them on Setup, Products."}
            action={
              products.length ? (
                <Button onClick={() => setDialog("import")} icon={<Upload size={16} aria-hidden />}>
                  Import
                </Button>
              ) : isStaff ? (
                <Link to="/setup/products" className={cn(focusRing, "rounded-control text-sm font-medium text-brand hover:underline")}>
                  Go to Products
                </Link>
              ) : undefined
            }
          />
        }
      />

      {products.length > 0 && (
        <section className="space-y-2" aria-labelledby="sold-products-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="sold-products-heading" className="text-base font-semibold text-ink">
              Product data for the plans
            </h2>
            <Badge tone="neutral">{products.length}</Badge>
          </div>
          <DataTable<SoldProduct>
            label="Product data"
            rows={products}
            columns={PRODUCT_COLUMNS}
            getRowId={(p) => p.product_id}
            onRowClick={setEditing}
            defaultSort={{ id: "name", dir: "asc" }}
          />
        </section>
      )}

      {(dialog === "sale" || editingSale) && (
        <SaleDrawer
          key={editingSale?.id ?? "new"}
          products={editingSale ? (list.data?.products ?? []) : products}
          companyId={companyId}
          defaultMonth={`${year}-01`}
          maxMonth={`${thisYear + 1}-12`}
          sale={editingSale}
          onClose={() => {
            setDialog(null);
            setEditingSale(null);
          }}
          onSaved={(outcome) => {
            toast({ title: outcome === "added" ? "Sale added" : outcome === "removed" ? "Sale removed" : "Sale updated", tone: "good" });
            setDialog(null);
            setEditingSale(null);
          }}
        />
      )}
      {dialog === "import" && (
        <ImportDrawer
          products={list.data?.products ?? []}
          siteId={site?.site_id ?? null}
          companyId={companyId}
          onClose={() => setDialog(null)}
          onImported={(r) => {
            toast({ title: `${r.created} added, ${r.updated} updated, ${r.unchanged} unchanged`, tone: "good" });
            setDialog(null);
          }}
        />
      )}
      {editing && (
        <ProductDrawer
          key={editing.product_id}
          product={editing}
          companyId={companyId}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            toast({ title: `${name} saved`, tone: "good" });
            setEditing(null);
          }}
        />
      )}
      {planBody && site && (
        <PlanDrawer
          body={planBody}
          siteName={site.name}
          result={plan.data}
          pending={plan.isPending}
          error={plan.isError ? plan.error : null}
          onRetry={() => plan.mutate(planBody)}
          onClose={() => {
            setPlanBody(null);
            plan.reset();
          }}
          onImported={(n) => {
            toast({ title: `${n} ${n === 1 ? "row" : "rows"} imported as Pending`, tone: "good" });
            setPlanBody(null);
            plan.reset();
          }}
        />
      )}
    </div>
  );
}

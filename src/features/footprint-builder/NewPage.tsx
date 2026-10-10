import { type FormEvent, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Button, Callout, EmptyState, PageHeader, SegmentedControl, Select, Toggle, YearPicker, panel, withoutParams } from "../../ui";
import { errorMessage, useCreateStudy, useSiteProducts, useVersions } from "./api";
import { type YearType, periodFor, periodText } from "./logic";

type SiteOption = { site_id: number; name: string };

function useManagerSites(): SiteOption[] {
  const { user } = useAuth();
  return useMemo(() => {
    const list = (user?.sites as SiteOption[] | undefined) ?? [];
    return list.length > 0 ? list : user?.site ? [user.site as SiteOption] : [];
  }, [user]);
}

const idParam = (v: string | null) => (v && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

/**
 * C02 `/products/new?product=&site=`: pick the product, site and year, then
 * open the builder on a new draft (optionally copied from the last version).
 */
export default function NewFootprintPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sites = useManagerSites();
  const siteFromUrl = idParam(params.get("site"));
  const siteId = siteFromUrl && sites.some((s) => s.site_id === siteFromUrl) ? siteFromUrl : sites.length === 1 ? sites[0].site_id : null;
  const productId = idParam(params.get("product"));
  const setParam = (key: string, value: number | null, drop?: string) =>
    setParams(
      (p) => {
        const next = withoutParams(p, drop ? [key, drop] : [key]);
        if (value !== null) next.set(key, String(value));
        return next;
      },
      { replace: true },
    );

  const products = useSiteProducts(siteId);
  const product = products.data?.find((p) => p.product_id === productId) ?? null;
  const versions = useVersions(siteId, product ? productId : null);
  const latest = versions.data?.[0] ?? null;
  const draft = versions.data?.find((v) => v.status === "draft") ?? null;

  const [yearType, setYearType] = useState<YearType>("CY");
  const [year, setYear] = useState(() => new Date().getFullYear() - 1);
  const [copy, setCopy] = useState(true);
  const create = useCreateStudy();

  const header = (
    <PageHeader
      title="New footprint"
      description="Pick the product and the twelve months it covers."
      secondaryActions={[{ label: "All footprints", icon: <ArrowLeft aria-hidden className="size-4" />, onClick: () => navigate("/products") }]}
    />
  );

  if (sites.length === 0)
    return (
      <div className="space-y-4">
        {header}
        <EmptyState icon={Building2} title="You don't manage any sites yet." description="Ask your admin to assign one." />
      </div>
    );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!siteId || !product) return;
    const body: Record<string, unknown> = { product_id: product.product_id, site_id: siteId, year_type: yearType, ...periodFor(yearType, year) };
    if (copy && latest) body.copy_from_id = latest.pcf_study_id;
    create.mutate(body, {
      onSuccess: (s) => navigate(`/products/${product.product_id}/footprints/${s.pcf_study_id}/edit`, { replace: true }),
    });
  };

  const productOptions = (products.data ?? []).map((p) => ({ value: p.product_id, label: p.name }));
  return (
    <div className="space-y-4">
      {header}
      <form onSubmit={onSubmit} className={`${panel} max-w-2xl space-y-5 p-4 sm:p-6`} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Producing site"
            required
            value={siteId}
            onChange={(v) => setParam("site", v, "product")}
            options={sites.map((s) => ({ value: s.site_id, label: s.name }))}
            placeholder="Choose a site"
          />
          <Select
            label="Product"
            required
            value={product ? product.product_id : null}
            onChange={(v) => setParam("product", v)}
            options={productOptions}
            placeholder={siteId ? "Choose a product" : "Choose a site first"}
            disabled={!siteId}
            loading={!!siteId && products.isPending}
            emptyText="No products on this site"
            error={products.error ? errorMessage(products.error, "Couldn't load the products.") : undefined}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SegmentedControl<YearType>
            label="Reference year type"
            options={[
              { value: "CY", label: "Calendar year" },
              { value: "FY", label: "Financial year" },
            ]}
            value={yearType}
            onChange={setYearType}
            className="self-end"
          />
          <YearPicker
            label="Reference period"
            value={year}
            onChange={(y) => y && setYear(y)}
            yearType={yearType}
            from={new Date().getFullYear() - 8}
            help={periodText(yearType, year)}
          />
        </div>

        {latest && (
          <Toggle
            label={`Copy from version ${latest.version}`}
            help="Brings its lines across so you only change what's different."
            checked={copy}
            onChange={setCopy}
          />
        )}

        {draft && (
          <Callout
            tone="info"
            title={`Version ${draft.version} of this product is still a draft.`}
            action={
              <Button size="sm" onClick={() => navigate(`/products/${draft.product?.product_id ?? productId}/footprints/${draft.pcf_study_id}/edit`)}>
                Continue the draft
              </Button>
            }
          >
            You can keep building it instead of starting another one.
          </Callout>
        )}

        {create.error != null && (
          <p role="alert" className="text-sm text-bad">
            {errorMessage(create.error, "Couldn't start the footprint.")}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button onClick={() => navigate("/products")}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!siteId || !product} loading={create.isPending}>
            Start footprint
          </Button>
        </div>
      </form>
    </div>
  );
}

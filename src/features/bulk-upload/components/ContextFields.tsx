import { useMemo } from "react";
import { Combobox, Select } from "../../../ui";
import type { Site } from "../api";
import type { UploadContext } from "../hooks/useUploadContext";
import { selectedSite } from "../logic";

/**
 * Client, site and category pickers. A contributor has no client picker: the
 * client follows from their own site.
 */
export function ContextFields(props: {
  ctx: UploadContext;
  onContext: (patch: Partial<UploadContext>) => void;
  sites: Site[];
  sitesLoading: boolean;
  contributor: boolean;
  categoryLoading?: boolean;
  /** While something runs that a new context would throw away. */
  disabled?: boolean;
}) {
  const { ctx, onContext, sites, contributor } = props;

  const clients = useMemo(() => {
    const byId = new Map<number, string>();
    for (const s of sites) if (s.company) byId.set(s.company.company_id, s.company.name);
    return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [sites]);
  const clientSites = sites
    .filter((s) => contributor || s.company?.company_id === ctx.clientId)
    .map((s) => ({ value: s.site_id, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const site = selectedSite(sites, ctx, contributor);
  const categories = (site?.categories ?? []).map((c) => ({ value: c.category_id, label: c.category_name })).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      {!contributor && (
        <Select<number>
          label="Client"
          required
          placeholder="Choose a client"
          value={ctx.clientId}
          options={clients}
          loading={props.sitesLoading}
          disabled={props.disabled}
          onChange={(v) => onContext({ clientId: v, siteId: null, categoryId: null })}
        />
      )}
      <Combobox<number>
        label="Site"
        required
        placeholder="Search sites…"
        value={site ? ctx.siteId : null}
        options={clientSites}
        emptyText={contributor ? "No site is assigned to you yet" : ctx.clientId ? "This client has no sites" : "Choose a client first"}
        disabled={props.disabled || (!contributor && !ctx.clientId)}
        onChange={(v) => onContext({ siteId: v, categoryId: null, clientId: contributor ? (sites.find((s) => s.site_id === v)?.company?.company_id ?? null) : ctx.clientId })}
      />
      <Select<number>
        label="Category"
        required
        placeholder="Choose a category"
        value={site ? ctx.categoryId : null}
        options={categories}
        emptyText={site ? "This site reports no categories" : "Choose a site first"}
        loading={props.categoryLoading}
        disabled={props.disabled}
        onChange={(v) => onContext({ categoryId: v })}
      />
    </>
  );
}


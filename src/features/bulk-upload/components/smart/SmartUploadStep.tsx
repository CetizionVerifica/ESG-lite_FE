import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Button, Callout, Combobox, FileDrop, Select, type FileDropItem, cn, focusRing } from "../../../../ui";
import type { Site } from "../../api";
import type { UploadContext } from "../../hooks/useUploadContext";
import { ACCEPT, MAX_BYTES, selectedSite } from "../../logic";

/**
 * Smart import, screen 1: one site (from the caller's own) and the workbook.
 * No category picker: the sheets say what they hold. Rows for any other site
 * are skipped, so a multi-site workbook is uploaded once per site.
 */
export function SmartUploadStep(props: {
  ctx: UploadContext;
  onContext: (patch: Partial<UploadContext>) => void;
  sites: { data: Site[]; loading: boolean; error: string | null; retry: () => void };
  /** Not a Superadmin: own sites only, no client picker. */
  contributor: boolean;
  /** Superadmin only: whether the chosen client has Smart import on (null until a client is chosen). */
  clientEnabled: boolean | null;
  file: File | null;
  onFile: (file: File | null) => void;
  busy: boolean;
  error: string | null;
  onNext: () => void;
}) {
  const { ctx, onContext, sites, file, contributor } = props;
  const site = selectedSite(sites.data, ctx, contributor);

  const clients = useMemo(() => {
    const byId = new Map<number, string>();
    for (const s of sites.data) if (s.company) byId.set(s.company.company_id, s.company.name);
    return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [sites.data]);
  const siteOptions = sites.data
    // A contributor's sites of a client with Smart import off would be refused after the upload.
    .filter((s) => (contributor ? s.company?.ai_import_enabled === true : s.company?.company_id === ctx.clientId))
    .map((s) => ({ value: s.site_id, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const items: FileDropItem[] = file ? [{ id: "workbook", file, status: props.busy ? "uploading" : "queued" }] : [];
  const clientOff = !contributor && ctx.clientId !== null && props.clientEnabled === false;
  const ready = !!site && !!file && !clientOff;

  return (
    <div className="space-y-5">
      {sites.error && (
        <Callout tone="warn" title="Couldn't load sites" action={<Button size="sm" variant="ghost" onClick={sites.retry}>Try again</Button>}>
          {sites.error}
        </Callout>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {!contributor && (
          <Select<number>
            label="Client"
            required
            placeholder="Choose a client"
            value={ctx.clientId}
            options={clients}
            loading={sites.loading}
            disabled={props.busy}
            onChange={(v) => onContext({ clientId: v, siteId: null, categoryId: null })}
          />
        )}
        <Combobox<number>
          label="Site"
          required
          help="This upload is for one site. Rows for other sites will be skipped; upload the file again for each site."
          placeholder="Search sites…"
          value={site ? ctx.siteId : null}
          options={siteOptions}
          emptyText={contributor ? "No site is assigned to you yet" : ctx.clientId ? "This client has no sites" : "Choose a client first"}
          disabled={props.busy || (!contributor && !ctx.clientId)}
          onChange={(v) => onContext({ siteId: v, categoryId: null, clientId: contributor ? (sites.data.find((s) => s.site_id === v)?.company?.company_id ?? null) : ctx.clientId })}
        />
      </div>

      {clientOff && (
        <Callout tone="info" title="Smart import is off for this client">
          Turn it on under{" "}
          <Link to={`/clients/${ctx.clientId}`} className={cn("font-medium text-accent underline", focusRing)}>
            the client's overview
          </Link>
          , or use the manual upload.
        </Callout>
      )}

      <FileDrop
        label="Workbook"
        help="Any layout: every sheet is read, headers are worked out, totals and blank rows are dropped. .xlsx, .xls or .csv, up to 100 MB."
        accept={ACCEPT}
        maxSize={MAX_BYTES}
        multiple={false}
        maxFiles={1}
        items={items}
        disabled={props.busy}
        onAdd={(files) => props.onFile(files[0] ?? null)}
        onRemove={() => props.onFile(null)}
      />

      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li>You'll see what the app worked out for each sheet and can change it before anything is planned.</li>
        <li>Rows are saved as Pending for the site's manager to approve, one at a time or all at once.</li>
      </ul>

      {props.error && <Callout tone="warn" title="Couldn't read the workbook">{props.error}</Callout>}

      <div className="flex justify-end">
        <Button variant="primary" disabled={!ready} loading={props.busy} onClick={props.onNext}>
          Upload and work out the mapping
        </Button>
      </div>
    </div>
  );
}

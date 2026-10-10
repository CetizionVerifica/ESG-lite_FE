import { useMemo } from "react";
import { Download } from "lucide-react";
import { Button, Callout, Combobox, FileDrop, MonthPicker, Select, exportMatrix, type FileDropItem } from "../../../ui";
import type { Site } from "../api";
import type { UploadContext } from "../hooks/useUploadContext";
import { ACCEPT, MAX_BYTES, buildFields, templateHeaders } from "../logic";
import type { ColumnConfig } from "../../../lib/emissions";

export function UploadStep(props: {
  ctx: UploadContext;
  onContext: (patch: Partial<UploadContext>) => void;
  sites: { data: Site[]; loading: boolean; error: string | null; retry: () => void };
  form: { data: ColumnConfig | null | undefined; loading: boolean; error: string | null };
  file: File | null;
  onFile: (file: File | null) => void;
  uploading: boolean;
  error: string | null;
  onNext: () => void;
}) {
  const { ctx, onContext, sites, form, file } = props;

  const clients = useMemo(() => {
    const byId = new Map<number, string>();
    for (const s of sites.data) if (s.company) byId.set(s.company.company_id, s.company.name);
    return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [sites.data]);
  const clientSites = sites.data
    .filter((s) => s.company?.company_id === ctx.clientId)
    .map((s) => ({ value: s.site_id, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const site = sites.data.find((s) => s.site_id === ctx.siteId && s.company?.company_id === ctx.clientId);
  const categories = (site?.categories ?? []).map((c) => ({ value: c.category_id, label: c.category_name })).sort((a, b) => a.label.localeCompare(b.label));

  const items: FileDropItem[] = file ? [{ id: "sheet", file, status: props.uploading ? "uploading" : "queued" }] : [];
  const noForm = !!site && ctx.categoryId !== null && !form.loading && !form.error && form.data === null;
  const ready = !!site && ctx.categoryId !== null && !!form.data && !!file;

  const downloadTemplate = () => {
    const name = categories.find((c) => c.value === ctx.categoryId)?.label ?? "category";
    void exportMatrix([templateHeaders(buildFields(form.data ?? null))], `bulk-upload-template-${name.toLowerCase().replace(/\W+/g, "-")}`, "xlsx");
  };

  return (
    <div className="space-y-5">
      {sites.error && (
        <Callout tone="warn" title="Couldn't load sites" action={<Button size="sm" variant="ghost" onClick={sites.retry}>Try again</Button>}>
          {sites.error}
        </Callout>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Select<number>
          label="Client"
          required
          placeholder="Choose a client"
          value={ctx.clientId}
          options={clients}
          loading={sites.loading}
          onChange={(v) => onContext({ clientId: v, siteId: null, categoryId: null })}
        />
        <Combobox<number>
          label="Site"
          required
          placeholder="Search sites…"
          value={site ? ctx.siteId : null}
          options={clientSites}
          emptyText={ctx.clientId ? "This client has no sites" : "Choose a client first"}
          disabled={!ctx.clientId}
          onChange={(v) => onContext({ siteId: v, categoryId: null })}
        />
        <Select<number>
          label="Category"
          required
          placeholder="Choose a category"
          value={site ? ctx.categoryId : null}
          options={categories}
          emptyText={site ? "This site reports no categories" : "Choose a site first"}
          loading={!!site && ctx.categoryId !== null && form.loading}
          onChange={(v) => onContext({ categoryId: v })}
        />
        <MonthPicker
          label="Reporting month"
          help="Used for rows without their own date. Map a date column to file rows month by month."
          value={ctx.month}
          onChange={(v) => v && onContext({ month: v })}
        />
      </div>

      {noForm && <Callout tone="warn" title="This category has no entry form at this site">Set one up in Capture, Column configs before uploading rows for it.</Callout>}
      {form.error && <Callout tone="warn" title="Couldn't load the entry form">{form.error}</Callout>}

      <FileDrop
        label="Spreadsheet"
        help="One sheet, header row first. .xlsx, .xls or .csv, up to 100 MB."
        accept={ACCEPT}
        maxSize={MAX_BYTES}
        multiple={false}
        maxFiles={1}
        items={items}
        disabled={props.uploading}
        onAdd={(files) => props.onFile(files[0] ?? null)}
        onRemove={() => props.onFile(null)}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Name the columns as in the template and they map themselves.</li>
          <li>One row per entry. Every row needs a category and a unit.</li>
          <li>Rows are saved as Pending for the site's manager to approve.</li>
        </ul>
        <Button variant="secondary" icon={<Download aria-hidden className="size-4" />} disabled={!form.data} onClick={downloadTemplate}>
          Download template
        </Button>
      </div>

      {props.error && <Callout tone="warn" title="Couldn't read the file">{props.error}</Callout>}

      <div className="flex justify-end">
        <Button variant="primary" disabled={!ready} loading={props.uploading} onClick={props.onNext}>
          Upload and map columns
        </Button>
      </div>
    </div>
  );
}

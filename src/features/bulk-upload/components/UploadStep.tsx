import { Download } from "lucide-react";
import { Button, Callout, FileDrop, MonthPicker, SegmentedControl, YearPicker, exportMatrix, type FileDropItem } from "../../../ui";
import { ContextFields } from "./ContextFields";
import { selectedSite } from "../logic";
import type { Site } from "../api";
import type { UploadContext } from "../hooks/useUploadContext";
import { ACCEPT, MAX_BYTES, buildFields, templateHeaders } from "../logic";
import { SUPPORTED_CURRENCIES } from "../../../lib/scope3/spend";
import type { ColumnConfig } from "../../../lib/emissions";

export function UploadStep(props: {
  ctx: UploadContext;
  onContext: (patch: Partial<UploadContext>) => void;
  sites: { data: Site[]; loading: boolean; error: string | null; retry: () => void };
  /** A contributor uploads for their own sites only, with no client picker. */
  contributor: boolean;
  form: { data: ColumnConfig | null | undefined; loading: boolean; error: string | null };
  file: File | null;
  onFile: (file: File | null) => void;
  uploading: boolean;
  error: string | null;
  onNext: () => void;
  /** SE-1: false for a User: the hints leave out the exchange rate. */
  detail: boolean;
}) {
  const { ctx, onContext, sites, form, file } = props;

  const site = selectedSite(sites.data, ctx, props.contributor);
  const category = site?.categories?.find((c) => c.category_id === ctx.categoryId);
  const categoryName = category?.category_name;

  const items: FileDropItem[] = file ? [{ id: "sheet", file, status: props.uploading ? "uploading" : "queued" }] : [];
  const noForm = !!site && ctx.categoryId !== null && !form.loading && !form.error && form.data === null;
  const ready = !!site && ctx.categoryId !== null && !!form.data && !!file;

  const downloadTemplate = () => {
    const name = categoryName ?? "category";
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
        <ContextFields
          ctx={ctx}
          onContext={onContext}
          sites={sites.data}
          sitesLoading={sites.loading}
          contributor={props.contributor}
          categoryLoading={!!site && ctx.categoryId !== null && form.loading}
        />
        {/* F-21: monthly, or one CY/FY year for every row (as Add data's Period). */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Period</legend>
          <SegmentedControl
            label="Report monthly or for a whole year"
            value={ctx.yearly ? "yearly" : "monthly"}
            onChange={(m) => onContext({ yearly: m === "yearly" ? { yearType: "FY", year: Number(ctx.month.slice(0, 4)) } : null })}
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: "Yearly" },
            ]}
          />
          {ctx.yearly ? (
            <div className="flex flex-wrap items-end gap-3">
              <SegmentedControl
                label="Calendar"
                size="sm"
                value={ctx.yearly.yearType}
                onChange={(t) => onContext({ yearly: { yearType: t, year: ctx.yearly!.year } })}
                options={[
                  { value: "CY", label: "Calendar year" },
                  { value: "FY", label: "Financial year" },
                ]}
              />
              <YearPicker
                label="Year"
                value={ctx.yearly.year}
                yearType={ctx.yearly.yearType}
                fyStartMonth={4}
                onChange={(y) => y && onContext({ yearly: { yearType: ctx.yearly!.yearType, year: y } })}
              />
            </div>
          ) : (
            <MonthPicker
              label="Reporting month"
              help="Used for rows without their own date. Map a date column to file rows month by month."
              value={ctx.month}
              onChange={(v) => v && onContext({ month: v })}
            />
          )}
          {ctx.yearly && (
            <p className="text-xs text-muted">Every row is filed as one entry for the whole year; date cells in the sheet aren&apos;t used. A category is filed either monthly or yearly within a year.</p>
          )}
        </fieldset>
      </div>

      {noForm && <Callout tone="warn" title="This category has no entry form at this site">{props.contributor ? "Ask your administrator to set one up before uploading rows for it." : "Set one up in Capture, Data-entry forms before uploading rows for it."}</Callout>}
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
          {category?.scope === "Scope 3" && (
            <li>
              For an amount spent, put the amount as the value and its currency code ({SUPPORTED_CURRENCIES.join(", ")}) as the unit
              {props.detail ? "; the exchange rate is the one on the row's date." : "."}
            </li>
          )}
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

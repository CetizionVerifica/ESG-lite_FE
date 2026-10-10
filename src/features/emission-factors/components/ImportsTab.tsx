import { ExternalLink, FileSpreadsheet, Trash2 } from "lucide-react";
import { Badge, Callout, type Column, DataTable, EmptyState, cn, focusRing } from "../../../ui";
import type { UserName } from "../api";
import { type Batch, type Site, type UploadRecord, formatDay, layoutLabel, uploadStatus } from "../logic";

type Props = {
  batches: { data: Batch[]; loading: boolean; error: string | null; onRetry: () => void };
  uploads: { data: UploadRecord[]; loading: boolean; error: boolean; onRetry: () => void };
  users: UserName[] | undefined;
  sites: Site[];
  onDeleteBatch: (batch: Batch) => void;
};

function userName(id: number | null | undefined, users: UserName[] | undefined): string {
  if (!id) return "—";
  const u = users?.find((x) => x.user_id === id);
  const full = [u?.name, u?.last_name].filter(Boolean).join(" ").trim();
  return full || u?.email || `User #${id}`;
}

/** Imports tab: factor batches (each import's factors, deletable together) and the uploaded sheets. */
export function ImportsTab({ batches, uploads, users, sites, onDeleteBatch }: Props) {
  const batchColumns: Column<Batch>[] = [
      { id: "uploaded", header: "Imported", sortable: true, value: (b) => formatDay(b.uploaded_at), sortValue: (b) => b.uploaded_at },
      { id: "site", header: "Site", sortable: true, value: (b) => b.site_name },
      { id: "category", header: "Category", sortable: true, value: (b) => b.category_name },
      { id: "count", header: "Factors", numeric: true, sortable: true, width: "6rem", value: (b) => b.count },
      {
        id: "delete",
        header: "",
        hideable: false,
        width: "3rem",
        value: () => null,
        exportValue: () => null,
        cell: (b) => (
          <button
            type="button"
            aria-label={`Delete import batch for ${b.site_name}, ${b.category_name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteBatch(b);
            }}
            className={cn("rounded-control p-1 text-muted hover:bg-bad-soft hover:text-bad", focusRing)}
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        ),
      },
  ];

  const siteName = (id: number | null | undefined) => (id ? (sites.find((s) => s.site_id === id)?.name ?? `Site #${id}`) : "All sites");
  const uploadColumns: Column<UploadRecord>[] = [
    {
      id: "file",
      header: "File",
      sortable: true,
      value: (u) => u.file_name,
      cell: (u) =>
        u.cloudinary_url ? (
          <a
            href={u.cloudinary_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn("inline-flex max-w-[16rem] items-center gap-1 rounded-chip text-brand hover:underline", focusRing)}
          >
            <span className="truncate">{u.file_name}</span>
            <ExternalLink aria-hidden className="size-3.5 shrink-0" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <span className="block max-w-[16rem] truncate">{u.file_name}</span>
        ),
    },
    { id: "by", header: "Uploaded by", sortable: true, value: (u) => userName(u.uploaded_by, users) },
    { id: "site", header: "Site", sortable: true, value: (u) => siteName(u.site_id) },
    { id: "layout", header: "Layout", sortable: true, value: (u) => layoutLabel(u.layout_type) },
    {
      id: "records",
      header: "Created / skipped",
      sortable: true,
      value: (u) => `${u.records_created ?? 0} / ${u.records_skipped ?? 0}`,
      sortValue: (u) => u.records_created ?? 0,
      cell: (u) => (
        <span className="font-num">
          {u.records_created ?? 0} <span className="text-muted">/ {u.records_skipped ?? 0}</span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      value: (u) => uploadStatus(u).label,
      cell: (u) => {
        const s = uploadStatus(u);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    { id: "date", header: "Uploaded", sortable: true, value: (u) => formatDay(u.created_at), sortValue: (u) => u.created_at ?? "" },
  ];

  return (
    <div className="space-y-8">
      <section aria-labelledby="ef-batches" className="space-y-3">
        <div>
          <h2 id="ef-batches" className="text-base font-semibold text-ink">
            Imported factors
          </h2>
          <p className="text-sm text-muted">Each import's factors, by site and category. Deleting a batch removes all of its factors.</p>
        </div>
        <DataTable<Batch>
          label="Imported factor batches"
          rows={batches.data}
          columns={batchColumns}
          getRowId={(b) => `${b.upload_batch_id}-${b.site_id}-${b.category_id}`}
          rowLabel={(b) => `${b.site_name}, ${b.category_name}`}
          loading={batches.loading}
          error={batches.error}
          onRetry={batches.onRetry}
          defaultSort={{ id: "uploaded", dir: "desc" }}
          empty={<EmptyState icon={FileSpreadsheet} title="No imports yet." description="Factors added by hand don't appear here." />}
          storageKey="p22-batches"
        />
      </section>
      <section aria-labelledby="ef-uploads" className="space-y-3">
        <div>
          <h2 id="ef-uploads" className="text-base font-semibold text-ink">
            Uploaded sheets
          </h2>
          <p className="text-sm text-muted">Sheets read by AI. "Not saved" means it was read but no factors were created from it.</p>
        </div>
        {uploads.error ? (
          <Callout tone="warn" title="Couldn't load uploaded sheets">
            The AI service didn't answer. Imported factors above are unaffected.{" "}
            <button type="button" onClick={uploads.onRetry} className={cn("rounded-chip font-medium underline", focusRing)}>
              Try again
            </button>
          </Callout>
        ) : (
          <DataTable<UploadRecord>
            label="Uploaded sheets"
            rows={uploads.data}
            columns={uploadColumns}
            getRowId={(u) => u.id}
            rowLabel={(u) => u.file_name}
            loading={uploads.loading}
            defaultSort={{ id: "date", dir: "desc" }}
            empty={<EmptyState icon={FileSpreadsheet} title="No sheets uploaded yet." />}
            storageKey="p22-uploads"
          />
        )}
      </section>
    </div>
  );
}

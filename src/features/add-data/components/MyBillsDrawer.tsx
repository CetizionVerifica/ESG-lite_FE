import { useState } from "react";
import { Eye, FileText, RotateCcw, Trash2 } from "lucide-react";
import { Button, DocumentViewer, Drawer, EmptyState, Modal, formatBytes, formatDate, type ViewerFile } from "../../../ui";
import { useBills, useDeleteBill, type Invoice } from "../api";

type Props = {
  open: boolean;
  onClose: () => void;
  siteId: number;
  categoryId: number;
  /** Id of the bill being read again, if any. */
  rereading: number | null;
  onReuse: (invoice: Invoice) => void;
};

const viewerFile = (inv: Invoice): ViewerFile => ({ name: inv.file_name, url: inv.cloudinary_url, type: inv.file_type, size: inv.file_size });

/** Bills uploaded earlier for this site and category: preview, read again, delete. */
export function MyBillsDrawer({ open, onClose, siteId, categoryId, rereading, onReuse }: Props) {
  const bills = useBills(siteId, categoryId, open);
  const remove = useDeleteBill();
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Invoice | null>(null);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="My bills"
      subtitle="Bills uploaded for this site and category"
      size="md"
      loading={bills.isPending && open}
      error={bills.isError ? "Couldn't load your bills." : null}
      onRetry={() => void bills.refetch()}
    >
      {bills.data && bills.data.length === 0 && <EmptyState icon={FileText} title="No bills yet" description="Bills you upload here appear in this list." />}
      <ul className="divide-y divide-line">
        {bills.data?.map((inv) => (
          <li key={inv.invoice_id} className="flex flex-wrap items-center gap-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{inv.file_name}</p>
              <p className="text-xs text-muted">
                {formatDate(inv.created_at.slice(0, 10))}
                {inv.file_size ? ` · ${formatBytes(inv.file_size)}` : ""}
              </p>
            </div>
            <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={() => setPreview(inv)} aria-label={`Preview ${inv.file_name}`}>
              <span className="hidden sm:inline">Preview</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<RotateCcw className="size-4" />}
              loading={rereading === inv.invoice_id}
              disabled={rereading !== null}
              onClick={() => onReuse(inv)}
            >
              Read again
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(inv)} aria-label={`Delete ${inv.file_name}`} />
          </li>
        ))}
      </ul>

      <DocumentViewer
        open={!!preview}
        onClose={() => setPreview(null)}
        file={preview ? viewerFile(preview) : null}
        files={bills.data?.map(viewerFile)}
        onNavigate={(f) => setPreview(bills.data?.find((b) => b.cloudinary_url === f.url) ?? null)}
      />
      <Modal
        open={!!confirmDelete}
        onClose={() => {
          remove.reset();
          setConfirmDelete(null);
        }}
        title="Delete this bill?"
        tone="destructive"
        description={`${confirmDelete?.file_name ?? ""} leaves My bills. Entries already saved from it keep their evidence.`}
        error={remove.isError ? "Couldn't delete the bill. Try again." : undefined}
        primaryAction={{
          label: "Delete bill",
          loading: remove.isPending,
          onClick: () =>
            confirmDelete &&
            remove.mutate(confirmDelete.invoice_id, {
              onSuccess: () => setConfirmDelete(null),
            }),
        }}
      />
    </Drawer>
  );
}

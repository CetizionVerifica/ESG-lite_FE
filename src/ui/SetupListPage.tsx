import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { DataTable, type DataTableProps } from "./table";

export type SetupListPageProps<T> = {
  title: string;
  description?: ReactNode;
  /** "Add site". Hidden when onAdd is missing. */
  addLabel?: string;
  onAdd?: () => void;
  /** Line between the header and the table, e.g. "12 sites". */
  summary?: ReactNode;
  /** The table; its `toolbar` usually holds a FilterBar. */
  table: DataTableProps<T>;
  /** The create/edit Drawer and the delete confirm. */
  children?: ReactNode;
};

/**
 * Setup list pattern shared by P19–P26: PageHeader with an Add action, a
 * filterable DataTable, and a right Drawer for create/edit (passed as children).
 * No inline cell editing.
 */
export function SetupListPage<T>({ title, description, addLabel, onAdd, summary, table, children }: SetupListPageProps<T>) {
  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        description={description}
        primaryAction={onAdd && addLabel ? { label: addLabel, onClick: onAdd, icon: <Plus aria-hidden className="size-4" /> } : undefined}
      />
      {summary !== undefined && (
        <p className="text-sm text-muted" data-testid="setup-summary">
          {summary}
        </p>
      )}
      <DataTable<T> {...table} />
      {children}
    </div>
  );
}

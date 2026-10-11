import ClientSwitcher from "./ClientSwitcher";

/**
 * Top strip above the page header. For Superadmin on client-scoped pages it
 * holds the client switcher on the right; otherwise it is just spacing.
 * No breadcrumb: the top nav already shows where you are, and pages render
 * their own title and actions below it (F3 PageHeader).
 */
export default function ContextBar({ showClientSwitcher, onClientPicked }: {
  showClientSwitcher: boolean;
  onClientPicked: (id: number) => void;
}) {
  if (!showClientSwitcher) return <div className="pt-6" aria-hidden />;
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-end gap-x-4 gap-y-2 pt-3">
      <ClientSwitcher onPicked={onClientPicked} />
    </div>
  );
}

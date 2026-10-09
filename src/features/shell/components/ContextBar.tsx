import { ChevronRight } from "lucide-react";
import type { ShellRoute } from "../routeMap";
import ClientSwitcher from "./ClientSwitcher";

/**
 * Top strip of the page header: breadcrumb on the left and, for Superadmin
 * on client-scoped pages, the client switcher on the right. Pages render
 * their own title and actions below it (F3 PageHeader).
 */
export default function ContextBar({ route, showClientSwitcher, onClientPicked }: {
  route: ShellRoute | null;
  showClientSwitcher: boolean;
  onClientPicked: (id: number) => void;
}) {
  if (!route && !showClientSwitcher) return null;
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3">
      {route ? (
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-(--t-muted)">
            {route.crumb.map((part, i) => {
              const last = i === route.crumb.length - 1;
              return (
                <li key={`${part}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={12} aria-hidden />}
                  <span aria-current={last ? "page" : undefined} className={last ? "font-medium text-(--t-ink)" : ""}>
                    {part}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>
      ) : (
        <span />
      )}
      {showClientSwitcher && <ClientSwitcher onPicked={onClientPicked} />}
    </div>
  );
}

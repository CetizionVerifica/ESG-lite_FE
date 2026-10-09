import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { SkeletonText } from "./Skeleton";
import { cn } from "./cn";
import { useFocusTrap } from "./hooks/useFocusTrap";
import { useLockBodyScroll } from "./hooks/useLockBodyScroll";
import { focusRing } from "./styles";

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Small line under the title, e.g. site · month. */
  subtitle?: ReactNode;
  /** Buttons next to the close button. */
  headerActions?: ReactNode;
  /** Sticky footer, e.g. Approve / Reject. */
  footer?: ReactNode;
  children?: ReactNode;
  /** 480, 600 or 720px wide; full width on phones. */
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  /** Replaces the body with an error state. */
  error?: string | null;
  onRetry?: () => void;
};

const widths = { sm: "sm:w-[480px]", md: "sm:w-[600px]", lg: "sm:w-[720px]" };

/** Right-side detail panel for record detail, audit trail and edit forms. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerActions,
  footer,
  children,
  size = "md",
  loading,
  error,
  onRetry,
}: DrawerProps) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const trap = useFocusTrap(ref, open, onClose);
  useLockBodyScroll(open);
  if (!open) return null;

  let body = children;
  if (loading) body = <SkeletonText lines={6} />;
  else if (error)
    body = (
      <EmptyState
        variant="error"
        title={error}
        action={onRetry && <Button onClick={onRetry}>Try again</Button>}
      />
    );

  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <div aria-hidden className="absolute inset-0 bg-ink/30" onClick={onClose} data-testid="drawer-backdrop" />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={loading || undefined}
        tabIndex={-1}
        onKeyDown={trap.onKeyDown}
        className={cn(
          "relative flex h-full w-full max-w-full flex-col border-l border-line bg-panel text-ink shadow-xl focus:outline-none",
          widths[size],
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-semibold">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
          </div>
          {headerActions}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn("rounded-control p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}
          >
            <X aria-hidden className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{body}</div>
        {footer && !loading && !error && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>
        )}
      </aside>
    </div>,
    document.body,
  );
}

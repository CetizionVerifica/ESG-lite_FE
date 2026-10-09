import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "./Button";
import { cn } from "./cn";
import { useFocusTrap } from "./hooks/useFocusTrap";
import { useLockBodyScroll } from "./hooks/useLockBodyScroll";
import { focusRing } from "./styles";

export type ModalAction = {
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** The confirm button. Its style follows `tone`. */
  primaryAction?: ModalAction;
  /** Defaults to a "Cancel" button that calls onClose. Pass null to hide it. */
  cancelLabel?: string | null;
  /** "destructive" makes the confirm button red and adds a warning icon. */
  tone?: "default" | "destructive";
  /** Shown above the actions, e.g. a failed save. */
  error?: ReactNode;
  size?: "sm" | "md";
};

/**
 * Confirmations and short forms only; anything longer belongs in a Drawer or a page.
 * Traps focus, closes on Esc and backdrop click (not while the action is busy).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  primaryAction,
  cancelLabel = "Cancel",
  tone = "default",
  error,
  size = "sm",
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const busy = !!primaryAction?.loading;
  const close = () => {
    if (!busy) onClose();
  };
  const trap = useFocusTrap(ref, open, close);
  useLockBodyScroll(open);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div aria-hidden className="absolute inset-0 bg-ink/40" onClick={close} data-testid="modal-backdrop" />
      <div
        ref={ref}
        role={tone === "destructive" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={trap.onKeyDown}
        className={cn(
          "relative w-full rounded-card border border-line bg-panel text-ink shadow-xl focus:outline-none",
          size === "sm" ? "max-w-md" : "max-w-xl",
        )}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          {tone === "destructive" && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bad-soft text-bad">
              <AlertTriangle aria-hidden className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description && (
              <div id={descId} className="mt-1 text-sm text-muted">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            disabled={busy}
            className={cn("rounded-control p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
        {children && <div className="px-5 pt-4">{children}</div>}
        {error && (
          <div role="alert" className="mx-5 mt-4 rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
          {cancelLabel !== null && (
            <Button onClick={close} disabled={busy}>
              {cancelLabel}
            </Button>
          )}
          {primaryAction && (
            <Button
              variant={tone === "destructive" ? "danger" : "primary"}
              onClick={primaryAction.onClick}
              loading={primaryAction.loading}
              disabled={primaryAction.disabled}
            >
              {primaryAction.label}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

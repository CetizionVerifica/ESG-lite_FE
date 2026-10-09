import { type ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";

/**
 * STAND-IN for `Drawer` from src/ui (F3, "UI component library" thread),
 * left-hand variant for the < 1024px nav. Traps focus, Esc and the scrim
 * close it, page scroll is locked while open.
 */
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Drawer({ open, onClose, title, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, onClose);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-(--t-panel) text-(--t-ink) shadow-xl outline-none"
      >
        <div className="flex h-13 shrink-0 items-center justify-between border-b border-(--t-line) px-4">
          <span className="text-sm font-semibold">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-(--r-sm) p-1.5 text-(--t-muted) hover:bg-(--t-tint) focus-visible:outline-2 focus-visible:outline-(--t-brand)"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

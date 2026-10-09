import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { focusableIn } from "./hooks/useFocusTrap";

export type PopoverProps = {
  /** Renders the trigger; spread the props onto a button. */
  trigger: (props: {
    "aria-expanded": boolean;
    "aria-controls": string;
    "aria-haspopup": "dialog";
    onClick: () => void;
  }) => ReactNode;
  children: (close: () => void) => ReactNode;
  /** Accessible name of the panel. */
  label: string;
  align?: "start" | "end";
  className?: string;
};

/**
 * Anchored panel for chip editors and pickers. Opens on click, moves focus in,
 * closes on Esc (focus back to the trigger) or a click outside.
 */
export function Popover({ trigger, children, label, align = "start", className }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel) (focusableIn(panel)[0] ?? panel).focus();
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger({ "aria-expanded": open, "aria-controls": id, "aria-haspopup": "dialog", onClick: () => {
          triggerRef.current = document.activeElement as HTMLElement | null;
          setOpen((o) => !o);
        } })}
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          className={cn(
            "absolute z-30 mt-1 min-w-56 rounded-control border border-line bg-panel p-3 text-ink shadow-lg focus:outline-none",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children(() => close())}
        </div>
      )}
    </div>
  );
}

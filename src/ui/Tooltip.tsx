import { cloneElement, useId, useState, type ReactElement } from "react";
import { cn } from "./cn";

export type TooltipProps = {
  content: string;
  /** One focusable element (usually a button). It gets aria-describedby. */
  children: ReactElement<Record<string, unknown>>;
  side?: "top" | "bottom";
};

/** Short hint on hover and keyboard focus; Esc hides it. Not for essential information. */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {cloneElement(children, {
        "aria-describedby": open ? id : undefined,
        onFocus: show,
        onBlur: hide,
        onKeyDown: (e: { key: string }) => {
          if (e.key === "Escape") hide();
        },
      })}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-chip bg-ink px-2 py-1 text-xs text-panel shadow",
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { focusableIn } from "./hooks/useFocusTrap";
import { layerPosition } from "./popoverPosition";
import { portalRoot } from "./portalRoot";

export type PopoverProps = {
  /** Renders the trigger; spread the props onto a button. */
  trigger: (props: { "aria-expanded": boolean; "aria-controls": string; "aria-haspopup": "dialog"; onClick: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  /** Accessible name of the panel. */
  label: string;
  align?: "start" | "end";
  className?: string;
};

/**
 * "layer" draws every Popover inside the provider in a body portal with fixed
 * positioning, anchored to its trigger. Use it around containers that clip
 * (overflow-hidden toolbars, scroll areas), so panels are never cut off.
 */
export type PopoverStrategy = "inline" | "layer";
const PopoverStrategyContext = createContext<PopoverStrategy>("inline");
export const PopoverLayer = ({ children }: { children: ReactNode }) => <PopoverStrategyContext.Provider value="layer">{children}</PopoverStrategyContext.Provider>;

/**
 * Anchored panel for chip editors and pickers. Opens on click, moves focus in,
 * closes on Esc (focus back to the trigger) or a click outside.
 */
export function Popover({ trigger, children, label, align = "start", className }: PopoverProps) {
  const strategy = useContext(PopoverStrategyContext);
  const layered = strategy === "layer";
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // Set by a mousedown that React routes through this popover (portalled panels
  // included, nested ones too), so the document listener knows it was inside.
  const insideRef = useRef(false);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !layered) {
      setPos(null);
      return;
    }
    const place = () => {
      const root = rootRef.current;
      const panel = panelRef.current;
      if (!root || !panel) return;
      const p = layerPosition(
        root.getBoundingClientRect(),
        { width: panel.offsetWidth, height: panel.scrollHeight },
        { width: window.innerWidth, height: window.innerHeight },
        align,
      );
      setPos({ top: p.top, left: p.left, maxHeight: p.maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, layered, align]);

  useEffect(() => {
    if (!open) return;
    insideRef.current = false;
    const panel = panelRef.current;
    // preventScroll: focusing must not scroll a clipping parent (a toolbar) sideways.
    if (panel) (focusableIn(panel)[0] ?? panel).focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => {
      const inside = insideRef.current || !!rootRef.current?.contains(e.target as Node);
      insideRef.current = false;
      if (!inside) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const panel = open && (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      onMouseDownCapture={() => {
        insideRef.current = true;
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          // Only this popover closes, not a Drawer or Modal around it.
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
      style={
        layered
          ? {
              position: "fixed",
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              maxHeight: pos?.maxHeight,
              visibility: pos ? undefined : "hidden",
            }
          : undefined
      }
      className={cn(
        "min-w-56 rounded-control border border-line bg-panel p-3 text-ink shadow-lg focus:outline-none",
        layered ? "z-50 overflow-y-auto" : cn("absolute z-30 mt-1", align === "end" ? "right-0" : "left-0"),
        className,
      )}
    >
      {children(() => close())}
    </div>
  );

  return (
    <div ref={rootRef} className="relative inline-block" onMouseDownCapture={() => (insideRef.current = true)}>
      {trigger({
        "aria-expanded": open,
        "aria-controls": id,
        "aria-haspopup": "dialog",
        onClick: () => {
          triggerRef.current = document.activeElement as HTMLElement | null;
          setOpen((o) => !o);
        },
      })}
      {layered ? panel && createPortal(panel, portalRoot()) : panel}
    </div>
  );
}

import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

export type TooltipProps = {
  content: ReactNode;
  /** One focusable element (usually a button). It gets aria-describedby. */
  children: ReactElement<Record<string, unknown>>;
  side?: "top" | "bottom";
  /** Tapping or clicking the child toggles the tip too (touch screens have no hover). */
  toggleOnClick?: boolean;
  className?: string;
};

/** Gap between trigger and tip, and the tip's minimum distance from the viewport edge (px). */
const GAP = 6;
const EDGE = 8;

type Handler = ((e: unknown) => void) | undefined;
type Pos = { top: number; left: number; side: "top" | "bottom" };

/**
 * Short hint on hover and keyboard focus; Esc hides it. Not for essential information.
 * The tip renders in a portal at a fixed position, so scroll areas and truncated cells
 * (DataTable headers, KPI labels) don't clip it; it stays inside the viewport.
 */
export function Tooltip({ content, children, side = "top", toggleOnClick, className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  // Open state when the pointer went down, so a tap that also focuses the child doesn't open and close at once.
  const openAtPointerDown = useRef<boolean | null>(null);
  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  const place = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const tip = tipRef.current?.getBoundingClientRect();
    if (!anchor || !tip) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let s = side;
    if (s === "top" && anchor.top - tip.height - GAP < EDGE) s = "bottom";
    else if (s === "bottom" && anchor.bottom + tip.height + GAP > vh - EDGE && anchor.top - tip.height - GAP >= EDGE) s = "top";
    const top = s === "top" ? anchor.top - tip.height - GAP : anchor.bottom + GAP;
    const centred = anchor.left + anchor.width / 2 - tip.width / 2;
    const left = Math.max(EDGE, Math.min(centred, vw - tip.width - EDGE));
    setPos({ top, left, side: s });
  }, [side]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, place, content]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    const onDown = (e: PointerEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (toggleOnClick) document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, place, toggleOnClick]);

  // Run the child's own handlers first (e.g. a Menu trigger's arrow keys), then ours.
  const own = children.props as {
    onFocus?: Handler;
    onBlur?: Handler;
    onKeyDown?: Handler;
    onClick?: Handler;
    onPointerDown?: Handler;
    "aria-describedby"?: string;
  };
  const describedBy = [own["aria-describedby"], open ? id : undefined].filter(Boolean).join(" ") || undefined;
  const clickProps = toggleOnClick
    ? {
        onPointerDown: (e: unknown) => {
          own.onPointerDown?.(e);
          openAtPointerDown.current = open;
        },
        onClick: (e: unknown) => {
          own.onClick?.(e);
          const was = openAtPointerDown.current ?? open;
          openAtPointerDown.current = null;
          setOpen(!was);
        },
      }
    : {};

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex"
      // Mouse only: a tap fires emulated mouse events, which would fight the click toggle.
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
    >
      {cloneElement(children, {
        "aria-describedby": describedBy,
        onFocus: (e: unknown) => {
          own.onFocus?.(e);
          show();
        },
        onBlur: (e: unknown) => {
          own.onBlur?.(e);
          hide();
        },
        onKeyDown: (e: { key: string }) => {
          own.onKeyDown?.(e);
          if (e.key === "Escape") hide();
        },
        ...clickProps,
      })}
      {open &&
        createPortal(
          <span
            ref={tipRef}
            id={id}
            role="tooltip"
            data-side={pos?.side ?? side}
            style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
            className={cn(
              "pointer-events-none z-[60] w-max max-w-64 rounded-chip bg-ink px-2 py-1 text-xs text-panel shadow",
              className,
            )}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { focusRing } from "./styles";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  /** Red text for destructive items (confirm them with a Modal). */
  danger?: boolean;
  disabled?: boolean;
  /** Makes the item a menuitemradio (e.g. Light / Dark / System). */
  checked?: boolean;
  /** The page the item links to is open (aria-current="page"). */
  current?: boolean;
};

/** Non-interactive rows: a divider, or a block such as the signed-in user or a group label. */
export type MenuDivider = { kind: "separator" } | { kind: "heading"; content: ReactNode };

export type MenuEntry = MenuItem | MenuDivider;

function isItem(entry: MenuEntry): entry is MenuItem {
  return !("kind" in entry);
}

export type MenuProps = {
  /** Renders the trigger; spread the props onto a button. */
  trigger: (props: {
    id: string;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
    onClick: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    ref: (el: HTMLButtonElement | null) => void;
  }) => ReactNode;
  items: MenuEntry[];
  align?: "start" | "end";
  label?: string;
};

/**
 * Action menu (role="menu"). Arrows / Home / End move, Enter or Space selects, Esc closes and returns focus.
 * Items with `checked` are radio items; separators and headings are skipped by the keyboard.
 */
export function Menu({ trigger, items, align = "end", label }: MenuProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.map((it, i) => (isItem(it) && !it.disabled ? i : -1)).filter((i) => i >= 0);

  const openAt = (index: number) => {
    setActive(index);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const move = (delta: number) => {
    if (!enabled.length) return;
    const pos = enabled.indexOf(active);
    setActive(enabled[(pos + delta + enabled.length) % enabled.length]);
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger({
        id: `${id}-trigger`,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": `${id}-menu`,
        onClick: () => (open ? close(false) : openAt(enabled[0] ?? 0)),
        onKeyDown: (e) => {
          if ((e.key === "ArrowDown" || e.key === "ArrowUp") && enabled.length) {
            e.preventDefault();
            openAt(e.key === "ArrowDown" ? enabled[0] : enabled[enabled.length - 1]);
          }
        },
        ref: (el) => {
          triggerRef.current = el;
        },
      })}
      {open && (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-labelledby={label ? undefined : `${id}-trigger`}
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), move(1));
            else if (e.key === "ArrowUp") (e.preventDefault(), move(-1));
            else if (e.key === "Home") (e.preventDefault(), setActive(enabled[0]));
            else if (e.key === "End") (e.preventDefault(), setActive(enabled[enabled.length - 1]));
            else if (e.key === "Escape") (e.stopPropagation(), close());
            else if (e.key === "Tab") close(false);
          }}
          className={cn(
            "absolute z-30 mt-1 min-w-44 rounded-control border border-line bg-panel py-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((it, i) => {
            if (!isItem(it)) {
              return it.kind === "separator" ? (
                <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-line" />
              ) : (
                <div key={`heading-${i}`} className="px-3 py-2">
                  {it.content}
                </div>
              );
            }
            const radio = it.checked !== undefined;
            return (
              <button
                key={it.label}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role={radio ? "menuitemradio" : "menuitem"}
                aria-checked={radio ? it.checked : undefined}
                aria-current={it.current ? "page" : undefined}
                tabIndex={i === active ? 0 : -1}
                aria-disabled={it.disabled || undefined}
                onClick={() => {
                  if (it.disabled) return;
                  close();
                  it.onSelect();
                }}
                onMouseEnter={() => !it.disabled && setActive(i)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                  it.danger ? "text-bad" : "text-ink",
                  (it.checked || it.current) && "font-semibold text-brand-text",
                  i === active && "bg-tint",
                  it.disabled && "cursor-not-allowed opacity-50",
                  focusRing,
                )}
              >
                {radio && (
                  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", it.checked ? "bg-brand" : "border border-line")} />
                )}
                {it.icon}
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

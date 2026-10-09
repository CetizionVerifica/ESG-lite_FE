import { type KeyboardEvent, type ReactNode, useCallback, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useDismiss } from "../hooks/useDismiss";
import { nextIndex } from "../menuKeys";

/**
 * STAND-IN for `Menu` from src/ui (F3, "UI component library" thread).
 * Click or Enter/Space/↓ opens; ↑↓ Home End move; Esc closes and returns
 * focus to the button; Tab closes. Never opens on hover.
 */
export type MenuEntry =
  | { kind: "item"; label: string; onSelect: () => void; current?: boolean; icon?: ReactNode }
  | { kind: "radio"; label: string; onSelect: () => void; checked: boolean }
  | { kind: "heading"; content: ReactNode }
  | { kind: "separator" };

interface MenuProps {
  label: ReactNode;
  /** Accessible name when `label` is an icon or avatar. */
  ariaLabel?: string;
  entries: MenuEntry[];
  align?: "start" | "end";
  buttonClassName: string;
  showChevron?: boolean;
  /** Marks the button as the current section (a child page is open). */
  current?: boolean;
}

export default function Menu({ label, ariaLabel, entries, align = "start", buttonClassName, showChevron = true, current }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const interactive = entries.filter((e) => e.kind === "item" || e.kind === "radio");

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);
  useDismiss(rootRef, open, () => close(false));

  const focusItem = (index: number) => {
    // Items mount with the menu, so wait a frame on first open.
    requestAnimationFrame(() => itemRefs.current[index]?.focus());
  };

  const openAt = (index: number) => {
    setOpen(true);
    focusItem(index);
  };

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAt(0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openAt(interactive.length - 1);
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === "Tab") {
      close(false);
      return;
    }
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    const next = nextIndex(current, e.key, interactive.length);
    if (next !== null) {
      e.preventDefault();
      itemRefs.current[next]?.focus();
    }
  };

  let itemIndex = -1;
  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        data-current={current || undefined}
        className={buttonClassName}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onButtonKeyDown}
      >
        {label}
        {showChevron && <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className={`absolute top-full z-50 mt-1.5 min-w-52 rounded-(--r-md) border border-(--t-line) bg-(--t-panel) py-1 text-(--t-ink) shadow-lg ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {entries.map((entry, i) => {
            if (entry.kind === "separator") return <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-(--t-line)" />;
            if (entry.kind === "heading") return <div key={`h-${i}`} className="px-3 py-2">{entry.content}</div>;
            itemIndex += 1;
            const index = itemIndex;
            const selected = entry.kind === "radio" ? entry.checked : entry.current;
            return (
              <button
                key={`${entry.kind}-${entry.label}`}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role={entry.kind === "radio" ? "menuitemradio" : "menuitem"}
                aria-checked={entry.kind === "radio" ? entry.checked : undefined}
                aria-current={entry.kind === "item" && entry.current ? "page" : undefined}
                tabIndex={-1}
                onClick={() => {
                  close(false);
                  entry.onSelect();
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none hover:bg-(--t-tint) focus:bg-(--t-tint) ${
                  selected ? "font-semibold text-(--t-brand-text)" : ""
                }`}
              >
                {entry.kind === "radio" && (
                  <span aria-hidden className={`size-2 rounded-full ${entry.checked ? "bg-(--t-brand)" : "border border-(--t-line)"}`} />
                )}
                {entry.kind === "item" && entry.icon}
                {entry.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

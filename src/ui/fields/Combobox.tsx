import { type CSSProperties, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../cn";
import { menuPosition } from "../menuPosition";
import { inputBase } from "../styles";
import { Field, type FieldBaseProps } from "./Field";
import type { Option } from "./Select";

export type ComboboxProps<V extends string | number> = FieldBaseProps & {
  value: V | null;
  onChange: (value: V | null) => void;
  options: Option<V>[];
  placeholder?: string;
  /** Shown when nothing matches the search, or there are no options. */
  emptyText?: string;
  /** Called with the search text, for server-side search. Local filtering still applies. */
  onSearch?: (query: string) => void;
};

/**
 * Searchable single select (ARIA combobox + listbox). Arrow keys move, Enter picks, Esc closes.
 * The list is portalled to `document.body` with fixed positioning, like Menu, so a table with
 * overflow (the footprint builder's line tables) never clips it; it flips above near the bottom.
 */
export function Combobox<V extends string | number>({
  value,
  onChange,
  options,
  placeholder = "Search…",
  emptyText = "No matches",
  onSearch,
  ...field
}: ComboboxProps<V>) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ top: 0, left: 0, width: 0 });
  const selected = options.find((o) => o.value === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const openList = () => {
    setOpen(true);
    setQuery("");
    const idx = selected ? options.indexOf(selected) : 0;
    setActive(Math.max(0, idx));
  };
  const pick = (o: Option<V>) => {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
    setQuery("");
  };
  const optionId = (i: number) => `${listId}-opt-${i}`;

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const root = document.documentElement;
      const pos = menuPosition(
        rect,
        { width: rect.width, height: listRef.current?.offsetHeight ?? 0 },
        { width: root.clientWidth || window.innerWidth, height: root.clientHeight || window.innerHeight },
        "start",
      );
      setStyle({ top: pos.top, left: pos.left, width: rect.width });
    };
    place();
    // Capture: a scroll in any ancestor (the table, a drawer body) moves the input.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
    // matches: a new set of options can change the list's height even at the same count.
  }, [open, matches]);

  return (
    <Field {...field}>
      {(control) => (
        <div className="relative">
          <input
            {...control}
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && matches[active] ? optionId(active) : undefined}
            autoComplete="off"
            placeholder={selected ? selected.label : placeholder}
            value={open ? query : selected?.label ?? ""}
            onFocus={openList}
            onClick={() => !open && openList()}
            onBlur={() => setOpen(false)}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
              onSearch?.(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!open) openList();
                else setActive((i) => Math.min(matches.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && open) {
                e.preventDefault();
                if (matches[active]) pick(matches[active]);
              } else if (e.key === "Escape" && open) {
                // Only the list closes, not a Drawer or Modal around it.
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                setQuery("");
              }
            }}
            className={cn(inputBase, "h-9 pr-8")}
          />
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          {open &&
            createPortal(
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                style={style}
                // The list lives outside any Popover or Menu around the combobox, so its
                // mousedown must not reach their document "click outside" handlers (which
                // would close them before the pick), nor move focus out of the input.
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                // Above drawers and modals (z-50) a combobox can sit in; below toasts (z-60).
                className="fixed z-[55] max-h-64 overflow-auto rounded-control border border-line bg-panel py-1 text-sm shadow-lg"
              >
                {matches.length === 0 ? (
                  <li className="px-3 py-2 text-muted">{emptyText}</li>
                ) : (
                  matches.map((o, i) => (
                    <li
                      key={String(o.value)}
                      id={optionId(i)}
                      role="option"
                      aria-selected={o.value === value}
                      aria-disabled={o.disabled || undefined}
                      // Keep focus in the input so blur doesn't close the list first.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(o)}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-ink",
                        i === active && "bg-tint",
                        o.disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {o.value === value && <Check aria-hidden className="size-4 text-brand-text" />}
                    </li>
                  ))
                )}
              </ul>,
              document.body,
            )}
        </div>
      )}
    </Field>
  );
}

import { useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../cn";
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

/** Searchable single select (ARIA combobox + listbox). Arrow keys move, Enter picks, Esc closes. */
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
                e.stopPropagation();
                setOpen(false);
                setQuery("");
              }
            }}
            className={cn(inputBase, "h-9 pr-8")}
          />
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          {open && (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-control border border-line bg-panel py-1 text-sm shadow-lg"
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
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}

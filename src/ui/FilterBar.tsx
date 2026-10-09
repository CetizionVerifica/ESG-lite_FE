import { useEffect, useRef, useState } from "react";
import { Bookmark, ChevronDown, Search, X } from "lucide-react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { cn } from "./cn";
import { TextField, type Option } from "./fields";
import {
  activeCount,
  clearFilter,
  EMPTY_FILTERS,
  loadViews,
  sameFilters,
  storeViews,
  toggleOption,
  upsertView,
  type FilterValues,
  type SavedView,
} from "./filterLogic";
import { Menu, type MenuItem } from "./Menu";
import { Modal } from "./Modal";
import { Popover } from "./Popover";
import { focusRing, inputBase } from "./styles";

export type FilterDef = {
  key: string;
  label: string;
  options: Option<string>[];
  /** Default true. A single-choice filter keeps one value. */
  multiple?: boolean;
};

export type FilterBarProps = {
  filters: FilterDef[];
  value: FilterValues;
  onChange: (value: FilterValues) => void;
  /** Hides the search box when false. */
  search?: boolean;
  searchPlaceholder?: string;
  /** Wait this long (ms) after typing before onChange. 0 = every keystroke. */
  searchDelay?: number;
  /** Turns on saved views, kept in this browser under this key. */
  storageKey?: string;
  /** Disables the chips while their options load. */
  loading?: boolean;
  className?: string;
};

function chipValue(def: FilterDef, selected: string[]): string {
  if (!selected.length) return "All";
  const first = def.options.find((o) => o.value === selected[0])?.label ?? selected[0];
  return selected.length === 1 ? first : `${first} +${selected.length - 1}`;
}

function FilterChip({ def, selected, disabled, onToggle, onClear }: {
  def: FilterDef;
  selected: string[];
  disabled?: boolean;
  onToggle: (option: string) => void;
  onClear: () => void;
}) {
  const multiple = def.multiple ?? true;
  return (
    <Popover
      label={`Filter by ${def.label.toLowerCase()}`}
      trigger={(t) => (
        <button
          type="button"
          disabled={disabled}
          {...t}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border bg-panel px-3 text-sm text-ink hover:bg-tint",
            "disabled:cursor-not-allowed disabled:opacity-60",
            selected.length ? "border-accent" : "border-line",
            focusRing,
          )}
        >
          <span className="text-muted">{def.label}:</span>
          <span className="font-medium">{chipValue(def, selected)}</span>
          <ChevronDown aria-hidden className="size-3.5 text-muted" />
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-1">
          {def.options.length === 0 && <p className="px-1 py-2 text-sm text-muted">No options</p>}
          <ul className="max-h-64 overflow-auto" role="group" aria-label={def.label}>
            {def.options.map((o) => (
              <li key={o.value}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-chip px-1.5 py-1 text-sm hover:bg-tint",
                    o.disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type={multiple ? "checkbox" : "radio"}
                    name={multiple ? undefined : `filter-${def.key}`}
                    checked={selected.includes(o.value)}
                    disabled={o.disabled}
                    onChange={() => {
                      onToggle(o.value);
                      if (!multiple) close();
                    }}
                    className="accent-accent"
                  />
                  {o.label}
                </label>
              </li>
            ))}
          </ul>
          {selected.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onClear();
                close();
              }}
            >
              Clear {def.label.toLowerCase()}
            </Button>
          )}
        </div>
      )}
    </Popover>
  );
}

/**
 * Search + filter chips above a table (replaces EmissionsFilterSidebar).
 * Controlled: keep the value in the URL with useFilterParams so filtered links are shareable.
 */
export function FilterBar({
  filters,
  value,
  onChange,
  search = true,
  searchPlaceholder = "Search",
  searchDelay = 300,
  storageKey,
  loading,
  className,
}: FilterBarProps) {
  const [text, setText] = useState(value.q);
  const latest = useRef(value);
  latest.current = value;

  // Follow outside changes (back button, a saved view, Clear all).
  useEffect(() => setText(value.q), [value.q]);

  useEffect(() => {
    if (text === latest.current.q) return;
    const t = setTimeout(() => onChange({ ...latest.current, q: text }), searchDelay);
    return () => clearTimeout(t);
  }, [text, searchDelay, onChange]);

  const [views, setViews] = useState<SavedView[]>(() => (storageKey ? loadViews(storageKey) : []));
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");
  const saveViews = (next: SavedView[]) => {
    setViews(next);
    if (storageKey) storeViews(storageKey, next);
  };

  const count = activeCount(value);
  const current = views.find((v) => sameFilters(v.value, value));
  const viewItems: MenuItem[] = [
    ...views.map((v) => ({ label: v.name, onSelect: () => onChange(v.value) })),
    { label: "Save current view…", onSelect: () => (setViewName(current?.name ?? ""), setNaming(true)), disabled: count === 0 },
    ...(current ? [{ label: `Delete "${current.name}"`, danger: true, onSelect: () => saveViews(views.filter((v) => v !== current)) }] : []),
  ];

  return (
    <div role="search" className={cn("flex flex-wrap items-center gap-2", className)}>
      {search && (
        <div className="relative w-full sm:w-64">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onChange({ ...value, q: text });
            }}
            className={cn(inputBase, "h-8 pl-8")}
          />
        </div>
      )}
      {filters.map((def) => (
        <FilterChip
          key={def.key}
          def={def}
          selected={value.filters[def.key] ?? []}
          disabled={loading}
          onToggle={(o) => onChange(toggleOption(value, def.key, o, def.multiple ?? true))}
          onClear={() => onChange(clearFilter(value, def.key))}
        />
      ))}
      {count > 0 && (
        <Button size="sm" variant="ghost" icon={<X aria-hidden className="size-3.5" />} onClick={() => onChange({ ...EMPTY_FILTERS, filters: {} })}>
          Clear all <Badge>{count}</Badge>
        </Button>
      )}
      {storageKey && (
        <div className="sm:ml-auto">
          <Menu
            label="Saved views"
            items={viewItems}
            trigger={(t) => (
              <Button {...t} size="sm" variant="secondary" icon={<Bookmark aria-hidden className="size-3.5" />}>
                {current ? current.name : "Views"}
              </Button>
            )}
          />
        </div>
      )}
      <Modal
        open={naming}
        onClose={() => setNaming(false)}
        title="Save view"
        description="Saved in this browser only."
        primaryAction={{
          label: "Save",
          disabled: !viewName.trim(),
          onClick: () => {
            saveViews(upsertView(views, { name: viewName, value }));
            setNaming(false);
          },
        }}
      >
        <TextField label="Name" value={viewName} onChange={setViewName} autoFocus maxLength={40} />
      </Modal>
    </div>
  );
}

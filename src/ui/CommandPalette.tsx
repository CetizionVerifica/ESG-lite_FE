import { useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, Loader2, Search } from "lucide-react";
import { cn } from "./cn";
import { useFocusTrap } from "./hooks/useFocusTrap";
import { useLockBodyScroll } from "./hooks/useLockBodyScroll";
import { filterPalette, type PaletteCommand } from "./paletteFilter";

export type { PaletteCommand };

export type CommandPaletteProps<C extends PaletteCommand> = {
  open: boolean;
  onClose: () => void;
  /** Static registry (routes). Filtered here: every word must match the label or keywords. */
  commands: C[];
  /** Ids run recently, newest first; shown on top when the query is empty. */
  recent?: string[];
  onRun: (command: C) => void;
  /** Entity search results for the current query (sites, categories, factors), already filtered by the caller. */
  results?: C[];
  resultsLoading?: boolean;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  /** Accessible name of the search box. */
  inputLabel?: string;
};

function groupBy<C extends PaletteCommand>(items: C[]): Array<{ title: string; items: C[] }> {
  const map = new Map<string, C[]>();
  for (const c of items) map.set(c.group, [...(map.get(c.group) ?? []), c]);
  return [...map].map(([title, xs]) => ({ title, items: xs }));
}

/** ⌘K palette: type to filter, ↑↓ to move, Enter to run, Esc to close. Open/close state lives with the shell. */
export function CommandPalette<C extends PaletteCommand>(props: CommandPaletteProps<C>) {
  if (!props.open) return null;
  return createPortal(<PaletteDialog {...props} />, document.body);
}

function PaletteDialog<C extends PaletteCommand>({
  onClose,
  commands,
  recent = [],
  onRun,
  results = [],
  resultsLoading,
  onQueryChange,
  placeholder = "Search pages, sites, categories…",
  inputLabel = "Search",
}: CommandPaletteProps<C>) {
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const trap = useFocusTrap(ref, true, onClose);
  useLockBodyScroll(true);

  const sections = useMemo(() => {
    const matches = filterPalette(commands, query);
    if (!query.trim()) {
      const byId = new Map(commands.map((c) => [c.id, c]));
      const recentItems = recent.map((id) => byId.get(id)).filter((c): c is C => !!c);
      const ids = new Set(recentItems.map((c) => c.id));
      return [
        ...(recentItems.length ? [{ title: "Recent", items: recentItems }] : []),
        ...groupBy(matches.filter((c) => !ids.has(c.id))),
      ];
    }
    return [...groupBy(matches), ...groupBy(results)];
  }, [commands, query, recent, results]);
  const flat = sections.flatMap((s) => s.items);
  const current = Math.min(active, Math.max(0, flat.length - 1));
  const optionId = (i: number) => `${listId}-${i}`;

  let i = -1;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div aria-hidden className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={trap.onKeyDown} className="relative w-full max-w-xl overflow-hidden rounded-card border border-line bg-panel text-ink shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search aria-hidden className="size-4 text-muted" />
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={flat.length ? optionId(current) : undefined}
            aria-label={inputLabel}
            autoComplete="off"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              onQueryChange?.(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = flat.length;
                if (!n) return;
                const next = (current + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
                setActive(next);
                document.getElementById(optionId(next))?.scrollIntoView?.({ block: "nearest" });
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (flat[current]) onRun(flat[current]);
              }
            }}
            className="h-12 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
          {resultsLoading && <Loader2 aria-label="Searching" className="size-4 animate-spin text-muted" />}
          <kbd className="rounded-chip border border-line px-1.5 font-num text-[10px] text-muted">Esc</kbd>
        </div>
        <div id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-1">
          {flat.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">{resultsLoading ? "Searching…" : `Nothing matches "${query}".`}</p>}
          {sections.map((s) => (
            <div key={s.title} role="group" aria-label={s.title}>
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted">{s.title}</p>
              {s.items.map((c) => {
                i += 1;
                const idx = i;
                return (
                  <div
                    key={`${s.title}-${c.id}`}
                    id={optionId(idx)}
                    role="option"
                    aria-selected={idx === current}
                    onMouseMove={() => setActive(idx)}
                    onClick={() => onRun(c)}
                    className={cn("flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-sm", idx === current && "bg-tint")}
                  >
                    {c.icon}
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.hint && <span className="truncate text-xs text-muted">{c.hint}</span>}
                    {idx === current && <CornerDownLeft aria-hidden className="size-3.5 text-muted" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

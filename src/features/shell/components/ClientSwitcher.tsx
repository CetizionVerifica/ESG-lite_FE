import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown, RotateCw } from "lucide-react";
import { useClientContext } from "../../../lib/clientContext";
import { useDismiss } from "../hooks/useDismiss";
import { useClients } from "../hooks/useShellQueries";
import { nextIndex } from "../menuKeys";
import { focusRing } from "./styles";

/**
 * Superadmin client switcher in the page header. Picking a client sets the
 * company context (lib/clientContext) that Reports and Brand themes use and
 * whose theme the page body previews.
 */
export default function ClientSwitcher({ onPicked }: { onPicked?: (id: number) => void }) {
  const { clientId, setClientId } = useClientContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const clients = useClients(true);

  const current = clients.data?.find((c) => c.id === clientId);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (clients.data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [clients.data, query]);
  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0));

  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (refocus) buttonRef.current?.focus();
  };
  useDismiss(rootRef, open, () => close(true));

  const pick = (id: number) => {
    setClientId(id);
    onPicked?.(id);
    close(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const match = matches[activeIndex];
      if (match) pick(match.id);
      return;
    }
    if (e.key === "Tab") {
      close(false);
      return;
    }
    const next = nextIndex(activeIndex, e.key, matches.length);
    if (next !== null && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive(next);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={`inline-flex h-8 max-w-64 items-center gap-2 rounded-(--r-md) border border-(--t-line) bg-(--t-panel) px-2.5 text-sm hover:bg-(--t-tint) ${focusRing}`}
      >
        <Building2 size={14} aria-hidden className="shrink-0 text-(--t-muted)" />
        <span className="text-(--t-muted)">Client:</span>
        <span className="truncate font-medium">{current?.name ?? (clientId ? `#${clientId}` : "Choose client")}</span>
        <ChevronDown size={14} aria-hidden className="shrink-0 text-(--t-muted)" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-(--r-md) border border-(--t-line) bg-(--t-panel) text-(--t-ink) shadow-lg">
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={matches.length ? `${listId}-${activeIndex}` : undefined}
            aria-label="Find a client"
            placeholder="Find a client…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="h-10 w-full border-b border-(--t-line) bg-transparent px-3 text-sm outline-none placeholder:text-(--t-muted)"
          />
          <div id={listId} role="listbox" aria-label="Clients" className="max-h-72 overflow-y-auto py-1">
            {clients.isPending &&
              [0, 1, 2].map((i) => <div key={i} className="mx-3 my-2 h-4 animate-pulse rounded bg-(--t-tint)" />)}
            {clients.isError && (
              <div role="alert" className="m-2 flex items-center justify-between rounded-(--r-sm) bg-(--t-bad-soft) px-2 py-1.5 text-xs text-(--t-bad)">
                Couldn't load clients.
                <button type="button" onClick={() => clients.refetch()} className={`inline-flex items-center gap-1 font-medium ${focusRing}`}>
                  <RotateCw size={12} aria-hidden /> Retry
                </button>
              </div>
            )}
            {clients.isSuccess && matches.length === 0 && <p className="px-3 py-4 text-center text-sm text-(--t-muted)">No client matches.</p>}
            {matches.map((c, i) => (
              <div
                key={c.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={c.id === clientId}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(c.id)}
                className={`mx-1 flex cursor-pointer items-center justify-between rounded-(--r-sm) px-2 py-1.5 text-sm ${i === activeIndex ? "bg-(--t-tint)" : ""}`}
              >
                <span className="truncate">{c.name}</span>
                {c.id === clientId && <Check size={14} aria-hidden className="text-(--t-brand-text)" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

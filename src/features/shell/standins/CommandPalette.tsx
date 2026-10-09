import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { type Command, filterCommands, withRecentFirst } from "../commands";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { nextIndex } from "../menuKeys";

/**
 * STAND-IN for `CommandPalette` from src/ui (F3, "UI component library"
 * thread). The registry it shows comes from ../commands.ts and moves over
 * unchanged when the real component lands.
 */
interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  recent: string[];
  onRun: (command: Command) => void;
}

export default function CommandPalette({ open, onClose, commands, recent, onRun }: CommandPaletteProps) {
  if (!open) return null;
  return <PaletteDialog onClose={onClose} commands={commands} recent={recent} onRun={onRun} />;
}

function PaletteDialog({ onClose, commands, recent, onRun }: Omit<CommandPaletteProps, "open">) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  useFocusTrap(dialogRef, true, onClose);

  const sections = useMemo(() => {
    const matches = filterCommands(commands, query);
    if (query.trim()) return [{ title: "Pages", items: matches }];
    const { recent: recentItems, rest } = withRecentFirst(matches, recent);
    return [
      { title: "Recent", items: recentItems },
      { title: "Pages", items: rest },
    ].filter((s) => s.items.length > 0);
  }, [commands, query, recent]);
  const flat = sections.flatMap((s) => s.items);
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const command = flat[activeIndex];
      if (command) onRun(command);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const next = nextIndex(activeIndex, e.key, flat.length);
    if (next !== null) {
      e.preventDefault();
      setActive(next);
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
    }
  };

  let index = -1;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/40" aria-hidden onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Go to page"
        className="relative w-full max-w-xl overflow-hidden rounded-(--r-lg) border border-(--t-line) bg-(--t-panel) text-(--t-ink) shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-(--t-line) px-4">
          <Search size={16} aria-hidden className="text-(--t-muted)" />
          <input
            data-autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={flat.length ? `${listId}-${activeIndex}` : undefined}
            aria-label="Search pages"
            placeholder="Search pages…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-(--t-muted)"
          />
          <kbd className="rounded-(--r-sm) border border-(--t-line) px-1.5 text-[11px] text-(--t-muted)">Esc</kbd>
        </div>
        <div id={listId} role="listbox" aria-label="Pages" className="max-h-[50vh] overflow-y-auto py-2">
          {flat.length === 0 && <p className="px-4 py-6 text-center text-sm text-(--t-muted)">No page matches “{query}”.</p>}
          {sections.map((section) => (
            <div key={section.title} role="group" aria-label={section.title}>
              <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-(--t-muted)">{section.title}</div>
              {section.items.map((command) => {
                index += 1;
                const i = index;
                const selected = i === activeIndex;
                return (
                  <div
                    key={command.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={selected}
                    onMouseMove={() => setActive(i)}
                    onClick={() => onRun(command)}
                    className={`mx-2 flex cursor-pointer items-center justify-between rounded-(--r-md) px-3 py-2 text-sm ${
                      selected ? "bg-(--t-tint)" : ""
                    }`}
                  >
                    <span>
                      {command.group !== "Pages" && <span className="text-(--t-muted)">{command.group} › </span>}
                      {command.label}
                    </span>
                    {selected && <CornerDownLeft size={14} aria-hidden className="text-(--t-muted)" />}
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

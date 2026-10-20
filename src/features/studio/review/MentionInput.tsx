// DS-13 · a comment box with @mentions (05-ux S9): typing "@" lists the
// people who can open the design (GET /docs/:id/people); ↑ ↓ pick, Enter or
// Tab insert "@Name ", Esc closes the list. ⌘/Ctrl + Enter sends.
import { useId, useMemo, useRef, useState } from "react";
import type { StudioPerson } from "../../../lib/studio/contracts";
import { Avatar, cn, inputBase } from "../../../ui";
import { insertMention, mentionQuery, searchPeople } from "./logic";

export interface MentionInputProps {
  value: string;
  onChange: (text: string) => void;
  /** A person picked from the list (the caller keeps them to send their ids). */
  onPick: (person: StudioPerson) => void;
  people: StudioPerson[];
  label: string;
  placeholder?: string;
  onSubmit?: () => void;
  rows?: number;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function MentionInput({ value, onChange, onPick, people, label, placeholder, onSubmit, rows = 3, autoFocus, disabled }: MentionInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [closed, setClosed] = useState(false);
  const q = mentionQuery(value, caret);
  const matches = useMemo(() => (q ? searchPeople(people, q.query) : []), [q, people]);
  const open = !!q && !closed && matches.length > 0;

  const pick = (p: StudioPerson) => {
    if (!q) return;
    const next = insertMention(value, q.start, caret, p);
    onChange(next.text);
    onPick(p);
    setCaret(next.caret);
    setActive(0);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        aria-label={label}
        placeholder={placeholder}
        rows={rows}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        className={cn(inputBase, "w-full resize-y py-2 text-sm")}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setClosed(false);
          setActive(0);
        }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % matches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + matches.length) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(matches[Math.min(active, matches.length - 1)]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setClosed(true);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label="People" className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-56 overflow-auto rounded-card border border-line bg-panel p-1 shadow-lg">
          {matches.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              className={cn("flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-sm", i === active ? "bg-tint text-ink" : "text-ink")}
            >
              <Avatar name={p.name} size="sm" />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-xs text-muted">{p.role}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useId, type ReactNode } from "react";
import { useRovingKeys } from "./hooks/useRovingKeys";
import { cn } from "./cn";
import { focusRing } from "./styles";

export type TabItem<V extends string> = { value: V; label: ReactNode; count?: number; disabled?: boolean };


export type TabsProps<V extends string> = {
  label: string;
  items: TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Prefix for tab/panel ids; pair with <TabPanel idBase=… />. */
  idBase?: string;
  className?: string;
};

export function Tabs<V extends string>({ label, items, value, onChange, idBase, className }: TabsProps<V>) {
  const auto = useId();
  const base = idBase ?? auto;
  const { refs, onKeyDown } = useRovingKeys(items, value, onChange);
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn("flex gap-1 overflow-x-auto border-b border-line", className)}>
      {items.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[t.value] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.value}`}
            aria-selected={selected}
            aria-controls={`${base}-panel-${t.value}`}
            tabIndex={selected ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.value)}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
              selected ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink",
              focusRing,
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn("rounded-full px-1.5 text-[11px] font-num", selected ? "bg-tint text-brand-text" : "bg-tint text-muted")}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The panel for one tab. Renders only when selected, unless `keepMounted`
 * (then it is hidden instead, so work in progress inside it survives a tab switch).
 */
export function TabPanel<V extends string>({
  idBase,
  value,
  current,
  children,
  className,
  keepMounted = false,
}: {
  idBase: string;
  value: V;
  current: V;
  children: ReactNode;
  className?: string;
  keepMounted?: boolean;
}) {
  if (value !== current && !keepMounted) return null;
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${value}`}
      aria-labelledby={`${idBase}-tab-${value}`}
      tabIndex={0}
      hidden={value !== current}
      className={cn("focus:outline-none", className)}
    >
      {children}
    </div>
  );
}

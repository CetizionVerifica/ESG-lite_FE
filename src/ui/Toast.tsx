import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "./cn";
import { focusRing } from "./styles";
import { ToastContext, type ToastApi, type ToastInput } from "./toastStore";

type Item = ToastInput & { id: number };

const ICONS = { neutral: Info, good: CheckCircle2, bad: XCircle };
const ICON_TONE = { neutral: "text-info", good: "text-good", bad: "text-bad" };

function ToastView({ item, onDismiss }: { item: Item; onDismiss: () => void }) {
  const tone = item.tone ?? "neutral";
  const Icon = ICONS[tone];
  const duration = item.duration ?? (item.action ? 8000 : 5000);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const started = useRef(0);

  useEffect(() => {
    if (duration === 0 || paused) return;
    started.current = Date.now();
    const t = setTimeout(onDismiss, remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current -= Date.now() - started.current;
    };
  }, [paused, duration, onDismiss]);

  return (
    <li
      role={tone === "bad" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-control border border-line bg-panel p-3 text-sm text-ink shadow-lg sm:w-96"
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", ICON_TONE[tone])} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{item.title}</p>
        {item.description && <p className="mt-0.5 text-muted">{item.description}</p>}
      </div>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            onDismiss();
          }}
          className={cn("rounded-chip px-1.5 py-0.5 font-medium text-brand-text hover:bg-tint", focusRing)}
        >
          {item.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className={cn("rounded-chip p-0.5 text-muted hover:text-ink", focusRing)}>
        <X aria-hidden className="size-4" />
      </button>
    </li>
  );
}

let nextId = 1;

/** Mount once near the root. Toasts stack bottom-right (bottom, full width on phones), newest last. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback((t: ToastInput) => {
    const id = nextId++;
    // Keep at most 3 on screen.
    setItems((xs) => [...xs.slice(-2), { ...t, id }]);
    return id;
  }, []);
  const api: ToastApi = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ol aria-label="Notifications" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
        {items.map((it) => (
          <ToastView key={it.id} item={it} onDismiss={() => dismiss(it.id)} />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}

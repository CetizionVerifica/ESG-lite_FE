import type { ReactNode } from "react";
import { AlertTriangle, Info, Lightbulb, X, type LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { focusRing } from "./styles";

export type CalloutTone = "info" | "warn" | "brand";

const TONES: Record<CalloutTone, { icon: LucideIcon; box: string; icon_: string }> = {
  info: { icon: Info, box: "border-info/30 bg-info-soft", icon_: "text-info" },
  warn: { icon: AlertTriangle, box: "border-warn/30 bg-warn-soft", icon_: "text-warn" },
  brand: { icon: Lightbulb, box: "border-brand-200 bg-tint", icon_: "text-brand-text" },
};

export type CalloutProps = {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  /** One action, e.g. a ghost Button or a link. */
  action?: ReactNode;
  onDismiss?: () => void;
  icon?: LucideIcon;
  className?: string;
};

/** Insight or guidance box. Warn uses role="status" so it's announced; others are plain content. */
export function Callout({ tone = "info", title, children, action, onDismiss, icon, className }: CalloutProps) {
  const t = TONES[tone];
  const Icon = icon ?? t.icon;
  return (
    <div role={tone === "warn" ? "status" : undefined} className={cn("flex gap-3 rounded-control border p-3 text-sm text-ink", t.box, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", t.icon_)} />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-ink/80">{children}</div>}
        {action && <div className="pt-1">{action}</div>}
      </div>
      {onDismiss && (
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className={cn("self-start rounded-chip p-0.5 text-muted hover:text-ink", focusRing)}>
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}

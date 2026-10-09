import type { ReactNode } from "react";
import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

export type EmptyStateProps = {
  /** One sentence. */
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  /** One action, usually a Button. */
  action?: ReactNode;
  /** "error" uses the bad tone and role="alert". */
  variant?: "empty" | "error";
  compact?: boolean;
  className?: string;
};

export function EmptyState({ title, description, icon, action, variant = "empty", compact, className }: EmptyStateProps) {
  const Icon = icon ?? (variant === "error" ? AlertTriangle : Inbox);
  return (
    <div
      role={variant === "error" ? "alert" : undefined}
      className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 p-4" : "gap-3 px-6 py-12", className)}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full",
          compact ? "size-8" : "size-11",
          variant === "error" ? "bg-bad-soft text-bad" : "bg-tint text-muted",
        )}
      >
        <Icon aria-hidden className={compact ? "size-4" : "size-5"} />
      </span>
      <p className="max-w-sm text-sm font-medium text-ink">{title}</p>
      {description && <div className="max-w-sm text-sm text-muted">{description}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

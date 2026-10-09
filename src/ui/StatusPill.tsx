import { CheckCircle2, CircleDashed, Clock, PencilLine, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

import type { Status } from "./status";

const STATUS: Record<Status, { label: string; icon: LucideIcon; className: string }> = {
  pending: { label: "Pending", icon: Clock, className: "bg-warn-soft text-warn" },
  approved: { label: "Approved", icon: CheckCircle2, className: "bg-good-soft text-good" },
  rejected: { label: "Rejected", icon: XCircle, className: "bg-bad-soft text-bad" },
  missing: { label: "Missing", icon: CircleDashed, className: "border border-dashed border-bad text-bad" },
  draft: { label: "Draft", icon: PencilLine, className: "bg-tint text-muted" },
};

export type StatusPillProps = {
  status: Status;
  /** Overrides the label, e.g. "Rejected · 2". The icon always stays. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

/** Fixed status colour + icon + label, so status never relies on colour alone. */
export function StatusPill({ status, label, size = "md", className }: StatusPillProps) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        s.className,
        className,
      )}
    >
      <Icon aria-hidden className={size === "sm" ? "size-3" : "size-3.5"} />
      {label ?? s.label}
    </span>
  );
}

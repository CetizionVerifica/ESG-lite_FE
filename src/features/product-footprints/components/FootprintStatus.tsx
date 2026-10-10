import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Globe2, PencilLine, type LucideIcon } from "lucide-react";
import { cn } from "../../../ui";
import { STATUS_LABEL, type RowStatus } from "../logic";

const LOOK: Record<RowStatus, { icon: LucideIcon; className: string }> = {
  none: { icon: CircleDashed, className: "border border-dashed border-line text-muted" },
  draft: { icon: PencilLine, className: "bg-tint text-muted" },
  in_review: { icon: Clock, className: "bg-info-soft text-info" },
  approved: { icon: CheckCircle2, className: "bg-good-soft text-good" },
  published: { icon: Globe2, className: "bg-good-soft text-good" },
  stale: { icon: AlertTriangle, className: "bg-warn-soft text-warn" },
};

/** Footprint status with its icon, so it never relies on colour alone. */
export function FootprintStatus({ status }: { status: RowStatus }) {
  const l = LOOK[status];
  const Icon = l.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", l.className)}>
      <Icon aria-hidden className="size-3.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}

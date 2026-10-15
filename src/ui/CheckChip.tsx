import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CheckIcon } from "../lib/scope3/checks";
import { CHECK_ICONS } from "./checkIcons";
import { cn } from "./cn";

/**
 * A review check as a chip (S3-15): icon and word, never colour alone. `held`
 * chips are the reasons a row waits for a manager; the hint is the title.
 */
export function CheckChip({ label, hint, icon, held = true, className }: { label: string; hint?: string; icon: CheckIcon; held?: boolean; className?: string }) {
  const Icon = CHECK_ICONS[icon];
  return (
    <span
      title={hint}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-chip px-1.5 py-0.5 text-[11px] font-medium leading-tight",
        held ? "bg-warn-soft text-warn" : "bg-good-soft text-good",
        className,
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** "Ready" chip: the row passed every check. */
export function ReadyChip({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-chip bg-good-soft px-1.5 py-0.5 text-[11px] font-medium leading-tight text-good", className)}>
      <CheckCircle2 aria-hidden className="size-3 shrink-0" />
      Ready
    </span>
  );
}

/** A pending row the checks haven't run on yet. */
export function UncheckedChip({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-chip bg-tint px-1.5 py-0.5 text-[11px] font-medium leading-tight text-muted", className)}>
      <AlertTriangle aria-hidden className="size-3 shrink-0" />
      Not checked yet
    </span>
  );
}

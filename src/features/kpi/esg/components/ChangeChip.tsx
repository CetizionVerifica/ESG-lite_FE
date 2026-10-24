import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "../../../../ui";
import type { ChangeWords } from "../logic";

const TONE = { good: "bg-good-soft text-good", bad: "bg-bad-soft text-bad", neutral: "bg-tint text-muted" } as const;
const ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;

/** A change with an arrow, the amount and Better / Worse: good or bad is never told by colour alone. */
export function ChangeChip({ change, className }: { change: ChangeWords; className?: string }) {
  const Icon = ICON[change.arrow];
  return (
    <span title={change.sentence} data-testid="change-chip" className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium", TONE[change.tone], className)}>
      <Icon aria-hidden className="size-3" />
      <span aria-hidden>
        {change.amount}
        {change.word && ` · ${change.word}`}
      </span>
      <span className="sr-only">{change.sentence}</span>
    </span>
  );
}

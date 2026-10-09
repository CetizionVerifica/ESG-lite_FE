import { Check } from "lucide-react";
import { cn } from "./cn";
import { focusRing } from "./styles";

export type Step = { id: string; label: string; description?: string; optional?: boolean };

export type StepperProps = {
  steps: Step[];
  /** Index of the current step. */
  current: number;
  /** Step ids already completed. */
  completed?: string[];
  /**
   * Whether the user may jump to a step by clicking it. Default: completed
   * steps and the first not-yet-completed step after them.
   */
  canJump?: (index: number, step: Step) => boolean;
  onStepChange?: (index: number) => void;
  label?: string;
  className?: string;
};

/** Multi-step progress (data entry, onboarding, bulk upload). Collapses to "Step 2 of 3" on phones. */
export function Stepper({ steps, current, completed = [], canJump, onStepChange, label = "Progress", className }: StepperProps) {
  const done = new Set(completed);
  const firstOpen = steps.findIndex((s) => !done.has(s.id));
  const allowed = (i: number) =>
    !!onStepChange && i !== current && (canJump ? canJump(i, steps[i]) : done.has(steps[i].id) || i === firstOpen);

  return (
    <nav aria-label={label} className={className}>
      <p className="text-sm text-muted sm:hidden">
        Step {current + 1} of {steps.length}: <span className="font-medium text-ink">{steps[current]?.label}</span>
      </p>
      <ol className="hidden items-start gap-2 sm:flex">
        {steps.map((s, i) => {
          const isDone = done.has(s.id);
          const isCurrent = i === current;
          const jump = allowed(i);
          const marker = (
            <span
              aria-hidden
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                isCurrent ? "border-brand bg-brand text-on-brand" : isDone ? "border-brand bg-brand-50 text-brand-text" : "border-line bg-panel text-muted",
              )}
            >
              {isDone && !isCurrent ? <Check className="size-3.5" /> : i + 1}
            </span>
          );
          const text = (
            <span className="min-w-0 text-left">
              <span className={cn("block text-sm font-medium", isCurrent ? "text-ink" : "text-muted")}>
                {s.label}
                {s.optional && <span className="ml-1 text-xs font-normal">(optional)</span>}
              </span>
              {s.description && <span className="block text-xs text-muted">{s.description}</span>}
            </span>
          );
          const status = isDone ? "completed" : isCurrent ? "current" : "not started";
          return (
            <li key={s.id} aria-current={isCurrent ? "step" : undefined} className="flex min-w-0 flex-1 items-start gap-2">
              {jump ? (
                <button
                  type="button"
                  onClick={() => onStepChange?.(i)}
                  className={cn("flex min-w-0 items-start gap-2 rounded-control p-0.5 hover:bg-tint", focusRing)}
                >
                  {marker}
                  {text}
                  <span className="sr-only">({status})</span>
                </button>
              ) : (
                <span className="flex min-w-0 items-start gap-2 p-0.5">
                  {marker}
                  {text}
                  <span className="sr-only">({status})</span>
                </span>
              )}
              {i < steps.length - 1 && <span aria-hidden className={cn("mt-3.5 h-px min-w-4 flex-1", isDone ? "bg-brand" : "bg-line")} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

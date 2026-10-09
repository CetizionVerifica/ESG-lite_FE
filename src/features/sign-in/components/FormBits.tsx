import type { ReactNode } from "react";
import { cn } from "../../../ui";
import { type Strength, passwordStrength } from "../logic";

/** Inline error under a form, announced to screen readers. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-control border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
      {children}
    </div>
  );
}

/** Inline success / confirmation note. */
export function FormNote({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-control border border-good/30 bg-good-soft px-3 py-2 text-sm text-ink">
      {children}
    </div>
  );
}

const BAR_TONE: Record<Strength["level"], string> = {
  0: "bg-bad",
  1: "bg-bad",
  2: "bg-warn",
  3: "bg-good",
  4: "bg-good",
};

/** Four-segment strength meter with its label. */
export function StrengthMeter({ password }: { password: string }) {
  const strength = passwordStrength(password);
  if (!password) return null;
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={cn("h-1 flex-1 rounded-full", step <= strength.level ? BAR_TONE[strength.level] : "bg-line")} />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">
        Strength: <span className="font-medium text-ink">{strength.label}</span>
      </p>
    </div>
  );
}

/** Heading block at the top of each form panel. */
export function FormHeading({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <header className="mb-6">
      <h2 className="font-brand text-2xl font-semibold text-ink">{title}</h2>
      {lead && <p className="mt-1 text-sm text-muted">{lead}</p>}
    </header>
  );
}

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "./Badge";

/** Marks a value the AI read from a document and nobody has changed yet (add-data bills, KPI-12 suggestions). */
export function AiChip({ label = "AI", hint = " filled, check it" }: { label?: ReactNode; /** Read by screen readers after the label. */ hint?: string }) {
  return (
    <Badge tone="brand" className="gap-0.5">
      <Sparkles aria-hidden className="size-3" />
      {label}
      {hint && <span className="sr-only">{hint}</span>}
    </Badge>
  );
}

/** A field label with the AI chip while the value is still the AI's. */
export function AiLabel({ text, ai }: { text: string; ai: boolean }) {
  if (!ai) return <>{text}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      <AiChip />
    </span>
  );
}

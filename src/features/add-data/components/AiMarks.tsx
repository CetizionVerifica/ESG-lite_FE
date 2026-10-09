import { Sparkles } from "lucide-react";
import { Badge } from "../../../ui";
import { LOW_CONFIDENCE } from "../logic/bill";

/** A field label with the AI chip while the value is still the AI's. */
export function AiLabel({ text, ai }: { text: string; ai: boolean }) {
  if (!ai) return <>{text}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      <Badge tone="brand" className="gap-0.5">
        <Sparkles aria-hidden className="size-3" />
        AI<span className="sr-only"> filled, check it</span>
      </Badge>
    </span>
  );
}

/** How sure the AI was of the category it suggested; warn below 60%. */
export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const low = confidence < LOW_CONFIDENCE;
  return (
    <Badge tone={low ? "warn" : "neutral"}>
      {Math.round(confidence)}% match{low && ", please check"}
    </Badge>
  );
}

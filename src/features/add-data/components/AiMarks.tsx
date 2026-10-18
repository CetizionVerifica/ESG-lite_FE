import { Badge } from "../../../ui";
import { LOW_CONFIDENCE } from "../logic/bill";

// The chip and label moved to src/ui (KPI-12 uses them too).
export { AiChip, AiLabel } from "../../../ui";

/** How sure the AI was of the category it suggested; warn below 60%. */
export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const low = confidence < LOW_CONFIDENCE;
  return (
    <Badge tone={low ? "warn" : "neutral"}>
      {Math.round(confidence)}% match{low && ", please check"}
    </Badge>
  );
}

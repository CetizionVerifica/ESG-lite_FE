import { AlertTriangle } from "lucide-react";
import { Badge } from "../../../ui";

/** "Overlaps Feb 1–15" (+N more). */
export function OverlapChip({ ranges }: { ranges: string[] }) {
  return (
    <Badge tone="warn" className="gap-1 whitespace-nowrap">
      <AlertTriangle aria-hidden className="size-3" />
      Overlaps {ranges[0]}
      {ranges.length > 1 ? ` +${ranges.length - 1}` : ""}
    </Badge>
  );
}

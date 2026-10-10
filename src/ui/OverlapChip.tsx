import { AlertTriangle } from "lucide-react";
import { Badge } from "./Badge";

/** "Overlaps Feb 1–15" (+N more): a production record shares days with another of the same product and site. */
export function OverlapChip({ ranges }: { ranges: string[] }) {
  return (
    <Badge tone="warn" className="gap-1 whitespace-nowrap">
      <AlertTriangle aria-hidden className="size-3" />
      Overlaps {ranges[0]}
      {ranges.length > 1 ? ` +${ranges.length - 1}` : ""}
    </Badge>
  );
}

import { categoryLabel, categoryShortName, isGhgCategoryNumber } from "../lib/scope3/contracts";
import { Badge } from "./Badge";
import { Tooltip } from "./Tooltip";
import { cn } from "./cn";
import { focusRing } from "./styles";

export type Scope3CategoryChipProps = {
  /** GHG Protocol category 1–15; null or anything else shows "Unmapped". */
  n: number | null | undefined;
  /** Number only, for very narrow cells (the full name stays in the tooltip). */
  compact?: boolean;
  className?: string;
};

/**
 * A Scope 3 category's GHG Protocol number and short name ("6 · Business
 * travel"), or "Unmapped" in the warning tone. The full name is in the tooltip
 * and in the accessible name.
 */
export function Scope3CategoryChip({ n, compact, className }: Scope3CategoryChipProps) {
  if (!isGhgCategoryNumber(n)) {
    return (
      <Tooltip content="No GHG Protocol category yet. A Superadmin confirms it on the Scope 3 boundary page.">
        <span tabIndex={0} className={cn("inline-flex rounded-chip", focusRing, className)}>
          <Badge tone="warn">Unmapped</Badge>
        </span>
      </Tooltip>
    );
  }
  const full = categoryLabel(n);
  return (
    <Tooltip content={full}>
      <span tabIndex={0} aria-label={full} className={cn("inline-flex rounded-chip", focusRing, className)}>
        <Badge tone="brand">
          <span aria-hidden className="tabular-nums">
            {compact ? n : `${n} · ${categoryShortName(n)}`}
          </span>
        </Badge>
      </span>
    </Tooltip>
  );
}

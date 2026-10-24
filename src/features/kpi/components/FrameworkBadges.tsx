import { type FrameworkUse, groupUses } from "../../../lib/kpi/badges";
import { FRAMEWORK_DESCRIPTION, FRAMEWORK_LABEL } from "../../../lib/kpi/labels";
import { Badge, Tooltip, cn, focusRing } from "../../../ui";

/**
 * Where a KPI is used (05-ux principle 1): small framework badges. With
 * `tips`, each badge is focusable and explains the framework and lists its
 * codes; leave tips off inside table rows, which open on Enter.
 */
export function FrameworkBadges({ items, tips = false, className }: { items: FrameworkUse[]; tips?: boolean; className?: string }) {
  const groups = groupUses(items);
  if (!groups.length) return <span className={cn("text-xs text-muted", className)}>Not mapped</span>;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {groups.map((g) => {
        const badge = <Badge tone={g.core ? "brand" : "neutral"}>{g.text}</Badge>;
        if (!tips) return <span key={g.framework}>{badge}</span>;
        return (
          <Tooltip
            key={g.framework}
            content={
              <span className="block max-w-xs">
                {FRAMEWORK_DESCRIPTION[g.framework]} Used in {FRAMEWORK_LABEL[g.framework]} {g.codes.join(", ")}
                {g.core ? " (BRSR Core: evidence needed)" : ""}.
              </span>
            }
          >
            <span tabIndex={0} className={cn("rounded-chip", focusRing)}>
              {badge}
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}

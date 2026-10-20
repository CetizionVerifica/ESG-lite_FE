import { Link } from "react-router-dom";
import { Presentation } from "lucide-react";
import { EmptyState, cn, focusRing, panel } from "../../../ui";

/** IN-0 placeholder for `/insights/present` (IN-8 builds present mode: one story panel per slide). */
export function PresentPlaceholder() {
  return (
    <section aria-label="Present insights" className={cn(panel, "my-6")} data-testid="insights-present-placeholder">
      <EmptyState
        icon={Presentation}
        title="Present mode is on its way."
        description="Full-screen slides of the hero strip and each story panel, with the same filters."
        action={
          <Link to="/insights" className={cn("inline-flex h-9 items-center rounded-control border border-line bg-panel px-3.5 text-sm font-medium text-ink hover:bg-tint", focusRing)}>
            Back to Insights
          </Link>
        }
      />
    </section>
  );
}

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn, focusRing } from "../../../ui";
import { Section } from "./Section";

/** Settings → Scope 3 (Admin and Superadmin, S3-0): the way into the company's Scope 3 settings. */
export function Scope3Section() {
  return (
    <Section
      id="scope3"
      title="Scope 3"
      description="Which of the 15 GHG Protocol categories your company reports, and why the others are left out."
    >
      <Link
        to="/settings/scope3"
        className={cn("inline-flex items-center gap-1.5 text-sm font-medium text-brand-text underline", focusRing)}
      >
        Open Scope 3 settings
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </Section>
  );
}

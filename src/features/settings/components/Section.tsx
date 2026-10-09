import type { ReactNode } from "react";
import { panel } from "../../../ui";
import { type SectionId, sectionDomId } from "../logic";

/** One settings card. Its heading names the region, so screen readers can jump between sections. */
export function Section({ id, title, description, children, footer }: {
  id: SectionId;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Save button and status, under a divider. */
  footer?: ReactNode;
}) {
  const headingId = `${sectionDomId(id)}-title`;
  return (
    <section id={sectionDomId(id)} aria-labelledby={headingId} className={`${panel} scroll-mt-24`}>
      <div className="space-y-4 p-5">
        <div className="space-y-1">
          <h2 id={headingId} tabIndex={-1} className="text-base font-semibold text-ink focus:outline-none">
            {title}
          </h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {children}
      </div>
      {footer && <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">{footer}</div>}
    </section>
  );
}

/** A read-only label/value row. */
export function ReadOnlyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

import type { ReactNode } from "react";

/** One component's block on /__ui. `id` is also the Playwright snapshot name. */
export function DemoSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} data-demo={id} aria-labelledby={`${id}-title`} className="rounded-card border border-line bg-panel p-5">
      <h2 id={`${id}-title`} className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function Variant({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted">{label}</p>
      {children}
    </div>
  );
}

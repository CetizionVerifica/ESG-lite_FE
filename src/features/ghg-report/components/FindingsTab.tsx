import { Lightbulb, ListChecks } from "lucide-react";

/** Key findings and recommended actions, worded like the branded PDF. */
export function FindingsTab({ findings, actions }: { findings: string[]; actions: string[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="ghg-findings" className="rounded-card border border-line bg-panel p-5">
        <h3 id="ghg-findings" className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Lightbulb aria-hidden className="size-4 text-brand-text" /> Key findings
        </h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
          {findings.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="ghg-actions" className="rounded-card border border-line bg-panel p-5">
        <h3 id="ghg-actions" className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <ListChecks aria-hidden className="size-4 text-brand-text" /> Recommended actions
        </h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
          {actions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted">The branded PDF adds a written narrative for the board.</p>
      </section>
    </div>
  );
}

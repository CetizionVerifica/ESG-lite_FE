import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { focusRing } from "./styles";

/** Centred message with one action: 403, 404 and "being redesigned" pages. */
export default function StatusPage({ code, title, body, action }: {
  code?: string;
  title: string;
  body: ReactNode;
  action?: { label: string; to: string };
}) {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center py-16 text-center sm:py-24">
      {code && <p className="font-mono text-sm font-semibold text-(--t-brand-text)">{code}</p>}
      <h1 className="mt-2 text-2xl font-semibold text-(--t-ink)">{title}</h1>
      <div className="mt-3 text-sm leading-relaxed text-(--t-muted)">{body}</div>
      {action && (
        <Link
          to={action.to}
          className={`mt-6 inline-flex h-9 items-center rounded-(--r-md) bg-(--t-brand) px-4 text-sm font-medium text-(--t-on-brand) hover:opacity-90 ${focusRing} focus-visible:ring-offset-2`}
        >
          {action.label}
        </Link>
      )}
    </section>
  );
}

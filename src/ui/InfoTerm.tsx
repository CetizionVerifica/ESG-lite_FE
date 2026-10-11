import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { cn } from "./cn";
import { GLOSSARY, findTerm, type GlossaryEntry, type TermKey } from "./glossary";
import { focusRing } from "./styles";

export type InfoTipProps = {
  /** Glossary key. Or pass `definition` (with `label`) for a one-off explanation. */
  term?: TermKey;
  definition?: string;
  /** Term name for the button's accessible name and the tip heading. Defaults to the glossary term. */
  label?: string;
  side?: "top" | "bottom";
  className?: string;
};

function resolve(term: TermKey | undefined, definition: string | undefined, label: string | undefined): GlossaryEntry | null {
  if (definition) return { term: label ?? "", definition };
  return term ? GLOSSARY[term] : null;
}

/**
 * Highlighted "i" button that explains a term. Hover, keyboard focus or a tap shows the
 * definition; Esc or a tap elsewhere hides it. The visible dot is small, the hit area is 32px.
 */
export function InfoTip({ term, definition, label, side, className }: InfoTipProps) {
  const entry = resolve(term, definition, label);
  if (!entry) return null;
  const name = label ?? entry.term;
  return (
    <Tooltip
      side={side}
      toggleOnClick
      className="max-w-72 px-2.5 py-1.5 leading-snug"
      content={
        <>
          {name && <span className="font-semibold">{name}: </span>}
          {entry.definition}
        </>
      }
    >
      <button
        type="button"
        aria-label={name ? `What is ${name}?` : "What does this mean?"}
        data-info-term={term}
        // Inside clickable rows (DataTable onRowClick) the tap is for the tip, not the row.
        onClick={(e) => e.stopPropagation()}
        className={cn(
          // Accent tint + ring so it reads as "help here" in every theme; status colours are left alone.
          "relative inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full bg-accent/15 align-middle text-accent ring-1 ring-accent/40 transition-colors hover:bg-accent hover:text-panel",
          "before:absolute before:-inset-2 before:content-['']",
          focusRing,
          className,
        )}
      >
        <Info aria-hidden className="size-3" strokeWidth={2.5} />
      </button>
    </Tooltip>
  );
}

export type InfoTermProps = Omit<InfoTipProps, "label"> & {
  /** The visible term. When `term` is omitted and this is a string, it is looked up in the glossary. */
  children: ReactNode;
  className?: string;
};

/** A term followed by its InfoTip. Renders just the text when nothing in the glossary matches. */
export function InfoTerm({ children, term, definition, side, className }: InfoTermProps) {
  const key = term ?? findTerm(children) ?? undefined;
  const label = typeof children === "string" ? children : undefined;
  if (!key && !definition) return <>{children}</>;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="min-w-0">{children}</span>
      <InfoTip term={key} definition={definition} label={label} side={side} />
    </span>
  );
}

/** InfoTip for a label that matches a glossary term, else nothing. Shared components use it after their own labels. */
export function AutoInfoTip({ label, side, className }: { label: unknown; side?: "top" | "bottom"; className?: string }) {
  const key = findTerm(label);
  return key ? <InfoTip term={key} label={label as string} side={side} className={className} /> : null;
}

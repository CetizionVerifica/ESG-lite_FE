import { cn, focusRing } from "../../../ui";

/** Router links that look like src/ui Buttons (Button renders a <button>, these navigate). */
export const linkButton = {
  primary: cn(
    "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-control bg-brand px-3.5 text-sm font-medium text-on-brand hover:opacity-90",
    focusRing,
  ),
  secondarySm: cn(
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-control border border-line bg-panel px-2.5 text-xs font-medium text-ink hover:bg-tint",
    focusRing,
  ),
};

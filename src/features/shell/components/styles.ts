/** Shared class strings for items on the dark top bar (--t-chrome). */
export const chromeItem = (active: boolean) =>
  `inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-(--r-md) px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-(--t-chrome-fg) ${
    active
      ? "bg-(--t-chrome-active) font-semibold text-(--t-chrome-fg)"
      : "text-(--t-chrome-muted) hover:bg-(--t-chrome-active) hover:text-(--t-chrome-fg)"
  }`;

export const chromeIconButton =
  "relative inline-flex size-9 items-center justify-center rounded-(--r-md) text-(--t-chrome-muted) outline-none hover:bg-(--t-chrome-active) hover:text-(--t-chrome-fg) focus-visible:ring-2 focus-visible:ring-(--t-chrome-fg)";

export const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-(--t-brand)";

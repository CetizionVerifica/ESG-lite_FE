import type { ReactNode } from "react";

/** Matches the shell's Command (src/features/shell/commands.ts) so the registry plugs in unchanged. */
export type PaletteCommand = {
  id: string;
  label: string;
  /** Section heading, e.g. "Pages", "Sites". */
  group: string;
  /** Extra search words, lower case. */
  keywords?: string;
  /** Right-aligned hint, e.g. a path or "Site". */
  hint?: string;
  icon?: ReactNode;
};

/** Every word of the query must appear in the label, keywords or group. */
export function filterPalette<C extends PaletteCommand>(commands: C[], query: string): C[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  return commands.filter((c) => {
    const hay = `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

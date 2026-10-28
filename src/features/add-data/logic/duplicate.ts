// Add data's duplicate answer (ESG-lite createEmission): a 409 for a row
// already saved for the site, category and month, or a 403
// REPLACE_NOT_ALLOWED when the server refuses a Replace. The saved entry it
// collides with, who entered it, and whether this person may replace it
// (Replace deletes the saved entry: a User replaces only their own entry that
// isn't approved).

export type DuplicateBody = {
  message?: string;
  code?: string;
  duplicate?: boolean;
  existing_emission?: { total_emission?: number | string | null; status?: string | null } | null;
  entered_by?: { name?: string | null; you?: boolean } | null;
  can_replace?: boolean;
};

export type SavedMatch = {
  tco2e: number | null;
  status: string | null;
  /** The name of the person who entered it; null when the server doesn't say. */
  enteredBy: string | null;
  enteredByYou: boolean;
  canReplace: boolean;
};

/** The answer is a conflict the duplicate dialog decides. */
export const isDuplicateAnswer = (status: number | undefined, body: DuplicateBody | undefined): boolean =>
  (status === 409 && body?.duplicate === true) || (status === 403 && body?.code === "REPLACE_NOT_ALLOWED");

/** The saved entry from the answer. A server that doesn't say who entered it or whether Replace is allowed leaves Replace on, as before. */
export function savedEntryOf(body: DuplicateBody | undefined): SavedMatch | null {
  const e = body?.existing_emission;
  if (!e) return null;
  return {
    tco2e: e.total_emission == null ? null : Number(e.total_emission),
    status: e.status ?? null,
    enteredBy: body?.entered_by?.name?.trim() || null,
    enteredByYou: body?.entered_by?.you === true,
    canReplace: body?.can_replace !== false,
  };
}

/** Why Replace is off for this row, or null when it's allowed. */
export function replaceBlocked(saved: SavedMatch | null): string | null {
  if (!saved || saved.canReplace) return null;
  if (!saved.enteredByYou) return `${saved.enteredBy ?? "Someone else"} entered this, so you can't replace it.`;
  return "It's already approved, so you can't replace it.";
}

/** "entered by you", "entered by Shyam Sharma", or "" when the server doesn't say. */
export function enteredByText(saved: SavedMatch | null): string {
  if (!saved) return "";
  if (saved.enteredByYou) return "entered by you";
  return saved.enteredBy ? `entered by ${saved.enteredBy}` : "";
}

/** "Replace all": Replace on every row that allows it; the others keep their choice. */
export function replaceWhereAllowed<C extends string>(
  items: { id: number | string; existing: SavedMatch | null }[],
  choices: Record<string, C | "replace">,
): Record<string, C | "replace"> {
  return Object.fromEntries(items.map((d) => [String(d.id), replaceBlocked(d.existing) ? choices[String(d.id)] : "replace"]));
}

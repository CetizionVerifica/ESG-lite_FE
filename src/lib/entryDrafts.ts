// Add data keeps typed rows in sessionStorage so a reload doesn't lose them.
// Keys are `add-data:{user}:{site}:{category}:{period}`, so another person on
// the tab never gets them. Signing out removes them all; an expired session
// (401) doesn't, so the same person signing back in finds their rows.

export const ENTRY_DRAFT_PREFIX = "add-data:";

export function entryDraftKey(userId: number | null, siteId: number, categoryId: number, period: string): string {
  return `${ENTRY_DRAFT_PREFIX}${userId ?? "anon"}:${siteId}:${categoryId}:${period}`;
}

export function clearEntryDrafts(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(ENTRY_DRAFT_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: there are no drafts to clear.
  }
}

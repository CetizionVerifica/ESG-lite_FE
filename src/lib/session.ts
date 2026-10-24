// The signed-in session as the app keeps it in localStorage. Signing out (and
// an expired session) removes these keys only (#245): a person's choices on
// this device stay for when they sign back in — the company picked in the
// account menu (`activeCompany:<user id>`, M6), table columns and density
// (`dt:*`), saved filter views (`fb:*`), appearance and dismissed notes.

export const SESSION_KEYS = ["token", "role", "user"] as const;

export function clearSession(): void {
  for (const key of SESSION_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage blocked: there is no stored session to remove.
    }
  }
}

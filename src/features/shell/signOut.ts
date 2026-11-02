import { forgetThreads } from "../../lib/assistant/logic";

export interface SignOutDeps {
  logout: () => void;
  /** From the client context; null also removes esglite.clientId from storage. */
  setClientId: (id: number | null) => void;
  clearQueries: () => void;
  navigate: (to: string) => void;
}

/**
 * Ends the session from the shell. Forgets the Superadmin's client and any
 * help assistant conversation so the next person to sign in on this browser
 * doesn't inherit them.
 */
export function signOutSession({ logout, setClientId, clearQueries, navigate }: SignOutDeps): void {
  setClientId(null);
  forgetThreads();
  logout();
  clearQueries();
  navigate("/login");
}

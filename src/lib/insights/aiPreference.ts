// IN-9 · "Natural wording" on the insight cards: remembered per user in this
// browser (default off). A per-viewer convenience only; storage that is
// missing, blocked or throws just means "off".
import { useCallback, useState } from "react";
import { useAuth } from "../../context/AuthContext";

const PREFIX = "insights.naturalWording.";

/** The storage key for a user (`anon` before the session user is known). */
export const naturalWordingKey = (userId: number | string | null | undefined) => `${PREFIX}${userId ?? "anon"}`;

export function readNaturalWording(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeNaturalWording(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked: the choice lasts for this view only.
  }
}

const userIdOf = (user: unknown): number | string | null => {
  const id = (user as { user_id?: unknown } | null | undefined)?.user_id;
  return typeof id === "number" || typeof id === "string" ? id : null;
};

/** `[on, setOn]` for the cards' "Natural wording" toggle, remembered per user. */
export function useNaturalWording(): [boolean, (on: boolean) => void] {
  const { user } = useAuth();
  const key = naturalWordingKey(userIdOf(user));
  const [state, setState] = useState(() => ({ key, on: readNaturalWording(key) }));
  // Another user signed in (or the session user arrived): read their choice.
  const on = state.key === key ? state.on : readNaturalWording(key);
  const setOn = useCallback(
    (next: boolean) => {
      writeNaturalWording(key, next);
      setState({ key, on: next });
    },
    [key],
  );
  return [on, setOn];
}

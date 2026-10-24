import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { type Door, returnPath, wrongDoor } from "../logic";

/** A password, or a one-time code sent by email. */
export type Credentials = { email: string; password: string } | { email: string; code: string };

/** Outcome of a sign-in: signed in, or turned away at the wrong door (and signed out). */
export type SignInResult = { ok: true } | { ok: false; rightDoor: Door };

/**
 * Signs in through one door. The right role goes back to the in-app path it
 * was sent here from (ProtectedRoute's `state.from`), else to "/" where
 * RootRedirect picks the role's home; the wrong one is signed out again
 * straight away.
 */
export function useSignIn(door: Door) {
  const { login, loginWithCode, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  return useMutation<SignInResult, unknown, Credentials>({
    mutationFn: async (credentials) => {
      const email = credentials.email.trim();
      const role = "code" in credentials ? await loginWithCode(email, credentials.code) : await login(email, credentials.password);
      const rightDoor = wrongDoor(role, door);
      if (rightDoor) {
        logout();
        return { ok: false, rightDoor };
      }
      return { ok: true };
    },
    onSuccess: (result) => {
      if (result.ok) navigate(returnPath((location.state as { from?: unknown } | null)?.from), { replace: true });
    },
  });
}

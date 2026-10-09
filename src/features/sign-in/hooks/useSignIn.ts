import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { type Door, wrongDoor } from "../logic";

export interface Credentials {
  email: string;
  password: string;
}

/** Outcome of a sign-in: signed in, or turned away at the wrong door (and signed out). */
export type SignInResult = { ok: true } | { ok: false; rightDoor: Door };

/**
 * Signs in through one door. The right role goes to "/" where RootRedirect
 * picks the role's home; the wrong one is signed out again straight away.
 */
export function useSignIn(door: Door) {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  return useMutation<SignInResult, unknown, Credentials>({
    mutationFn: async ({ email, password }) => {
      const role = await login(email.trim(), password);
      const rightDoor = wrongDoor(role, door);
      if (rightDoor) {
        logout();
        return { ok: false, rightDoor };
      }
      return { ok: true };
    },
    onSuccess: (result) => {
      if (result.ok) navigate("/", { replace: true });
    },
  });
}

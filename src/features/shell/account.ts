import type { Appearance } from "../../theme";

export interface ShellUser {
  name: string;
  email: string;
  role: string;
}

export const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

interface SessionUser {
  name?: string | null;
  email?: string | null;
}

export function shellUser(user: SessionUser | null | undefined, role: string | null): ShellUser {
  const email = user?.email ?? "";
  return { name: user?.name || email || "Signed in", email, role: role ?? "" };
}

// Pure rules for the sign-in screens (P01). No React, no network.

/** Minimum password length, the same everywhere a password is set. */
export const MIN_PASSWORD_LENGTH = 8;

export const STAFF_ROLE = "Superadmin";

/** Which sign-in page the person used. */
export type Door = "client" | "staff";

/** Path of each door's sign-in page. */
export const DOOR_PATH: Record<Door, string> = { client: "/login", staff: "/superadmin/login" };

/**
 * Whether a role may sign in through this door. Staff (Superadmin) use the
 * staff page; everyone else uses their company's page. A wrong door ends the
 * session and points to the right page.
 */
export function wrongDoor(role: string | null | undefined, door: Door): Door | null {
  const isStaff = role === STAFF_ROLE;
  if (door === "client" && isStaff) return "staff";
  if (door === "staff" && !isStaff) return "client";
  return null;
}

/** Message shown under the form after a wrong-door sign-in. */
export function wrongDoorMessage(rightDoor: Door): string {
  return rightDoor === "staff"
    ? "This is a PlanetPulse staff account. Use the staff sign-in."
    : "This sign-in is for PlanetPulse staff. Use your company sign-in.";
}

interface ApiErrorLike {
  response?: { status?: number; data?: { message?: unknown } };
}

/** Readable message for a failed request, preferring the server's own text. */
export function errorMessage(error: unknown, fallback: string): string {
  const message = (error as ApiErrorLike | null)?.response?.data?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

/** Server status of a failed request, or null for a network error. */
export function errorStatus(error: unknown): number | null {
  const status = (error as ApiErrorLike | null)?.response?.status;
  return typeof status === "number" ? status : null;
}

/** Client slugs in `/{clientSlug}/login`: lower-case letters, digits and dashes. */
export function isClientSlug(value: string | undefined): value is string {
  return !!value && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value);
}

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface Strength {
  level: StrengthLevel;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
}

/**
 * Rough password strength for the meter: length and variety of character
 * classes. Anything under the minimum is "Too short" whatever its variety.
 */
export function passwordStrength(password: string): Strength {
  if (password.length < MIN_PASSWORD_LENGTH) return { level: 0, label: "Too short" };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  let score = classes - 1 + (password.length >= 12 ? 1 : 0) + (password.length >= 16 ? 1 : 0);
  score = Math.max(1, Math.min(4, score));
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;
  return { level: score as StrengthLevel, label: labels[score] };
}

export interface ResetErrors {
  password?: string;
  confirm?: string;
}

/** Field errors for the reset form; empty when it can be sent. */
export function validateReset(password: string, confirm: string): ResetErrors {
  const errors: ResetErrors = {};
  if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (confirm !== password) errors.confirm = "The passwords don't match.";
  return errors;
}

/** Cover heading: the client's name when known. */
export function coverTitle(clientName: string | null | undefined): string {
  return clientName ? `Carbon reporting for ${clientName}` : "Carbon reporting for your company";
}

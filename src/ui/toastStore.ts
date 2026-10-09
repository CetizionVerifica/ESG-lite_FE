import { createContext, useContext } from "react";

export type ToastTone = "neutral" | "good" | "bad";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** e.g. { label: "Undo", onClick: restore } */
  action?: { label: string; onClick: () => void };
  /** ms; 0 keeps it until dismissed. Default 5000, 8000 with an action. */
  duration?: number;
};

export type ToastApi = { toast: (t: ToastInput) => number; dismiss: (id: number) => void };

export const ToastContext = createContext<ToastApi | null>(null);

/** Show a toast for a completed action: `const { toast } = useToast(); toast({ title: "Entry approved" })`. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

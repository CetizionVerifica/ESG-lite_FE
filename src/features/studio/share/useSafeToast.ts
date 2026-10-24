// DS-11 · a toast when the app has a ToastProvider, nothing otherwise (the
// menus also mount in editor tests that render without one).
import { useContext } from "react";
import { ToastContext, type ToastInput } from "../../../ui/toastStore";

const none = (_t: ToastInput) => 0;

export function useSafeToast(): (t: ToastInput) => number {
  return useContext(ToastContext)?.toast ?? none;
}

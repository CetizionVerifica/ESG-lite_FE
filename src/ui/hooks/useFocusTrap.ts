import { useEffect, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * While `active`: moves focus into `ref` (first focusable, or the container)
 * and puts focus back where it was when deactivated. Spread the returned
 * `onKeyDown` onto the container: it keeps Tab / Shift+Tab inside and calls
 * `onEscape` on Esc.
 *
 * Keys are handled through React, so a nested overlay (an open Combobox or
 * Popover) that handles Esc first and stops propagation or calls
 * preventDefault closes only itself. The handler is rebuilt every render, so
 * Esc always sees the current `onEscape` (e.g. a Modal's live busy state).
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
): { onKeyDown: (e: ReactKeyboardEvent) => void } {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!root.contains(document.activeElement)) {
      const auto = root.querySelector<HTMLElement>("[data-autofocus]");
      (auto ?? focusableIn(root)[0] ?? root).focus();
    }
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [active, ref]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const root = ref.current;
    if (!active || !root || e.defaultPrevented) return;
    if (e.key === "Escape") {
      if (!onEscape) return;
      e.preventDefault();
      e.stopPropagation();
      onEscape();
      return;
    }
    // Tab from a portalled child (e.g. a nested Modal) belongs to that child's trap.
    if (e.key !== "Tab" || !root.contains(e.target as Node)) return;
    const items = focusableIn(root);
    if (items.length === 0) {
      e.preventDefault();
      root.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return { onKeyDown };
}

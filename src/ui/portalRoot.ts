/**
 * Where portalled panels (menus, popovers, dialogs, tooltips) attach: the element in full
 * screen when there is one, else document.body. In full screen the browser shows only the
 * fullscreen element's subtree, so a panel portalled to the body would be invisible.
 */
export function portalRoot(): HTMLElement {
  const fs = typeof document === "undefined" ? null : document.fullscreenElement;
  return fs instanceof HTMLElement ? fs : document.body;
}

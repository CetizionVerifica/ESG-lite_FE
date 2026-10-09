import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Unsaved-changes guard: blocks in-app navigation while `dirty` (the page
 * asks with a Modal) and asks the browser to confirm reloads and tab closes.
 */
export function useUnsavedGuard(dirty: boolean) {
  const blocker = useBlocker(
    // Pathname only: the preview's look and screen live in the query string.
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  return blocker;
}

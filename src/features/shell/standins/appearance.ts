import { useCallback, useEffect, useState } from "react";
import { useTheme as useLegacyTheme } from "../../../context/ThemeContext";
import type { Look } from "../brand";

/**
 * STAND-IN for F1's useTheme() { appearance, setAppearance, look }.
 * Drives the legacy ThemeContext (light/dark class on <html>) so the avatar
 * menu's Light / Dark / System choice works today. Replace with
 * `useTheme` from src/theme once the "Theme tokens foundation" PR lands.
 */
export type Appearance = "light" | "dark" | "system";

const KEY = "esglite.appearance";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
    // First visit to the new shell: keep what the legacy toggle chose.
    const legacy = localStorage.getItem("theme");
    return legacy === "light" || legacy === "dark" ? legacy : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

export function useAppearance(): { appearance: Appearance; setAppearance: (a: Appearance) => void; look: Look } {
  const { theme, toggleTheme } = useLegacyTheme();
  const [appearance, setState] = useState<Appearance>(readAppearance);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (appearance !== "system" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [appearance]);

  const wanted = appearance === "system" ? (systemDark ? "dark" : "light") : appearance;
  useEffect(() => {
    if (theme !== wanted) toggleTheme();
  }, [theme, wanted, toggleTheme]);

  const setAppearance = useCallback((next: Appearance) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the choice lasts until reload.
    }
    setState(next);
  }, []);

  // F1 resolves the client's look; until then dark chrome = Classic by day, Night by night.
  return { appearance, setAppearance, look: wanted === "dark" ? "night" : "classic" };
}

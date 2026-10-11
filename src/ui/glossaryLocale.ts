import { useSyncExternalStore } from "react";

/**
 * Language of the info-icon definitions only (the rest of the app stays English).
 * Chosen in the account menu and saved on this device; English until someone picks another.
 */
export const GLOSSARY_LOCALES = ["en", "ar", "es"] as const;
export type GlossaryLocale = (typeof GLOSSARY_LOCALES)[number];

/** Each language named in itself, as the menu shows it. */
export const LOCALE_NAMES: Record<GlossaryLocale, string> = { en: "English", ar: "العربية", es: "Español" };

export const LOCALE_STORAGE_KEY = "esglite.infoLanguage";

export function isGlossaryLocale(v: unknown): v is GlossaryLocale {
  return typeof v === "string" && (GLOSSARY_LOCALES as readonly string[]).includes(v);
}

export function localeDir(l: GlossaryLocale): "rtl" | "ltr" {
  return l === "ar" ? "rtl" : "ltr";
}

const listeners = new Set<() => void>();
let current: GlossaryLocale | null = null;

function read(): GlossaryLocale {
  if (current) return current;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // Storage blocked: English.
  }
  current = isGlossaryLocale(stored) ? stored : "en";
  return current;
}

/** Saves the choice on this device and updates every info icon. */
export function setGlossaryLocale(l: GlossaryLocale) {
  current = l;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, l);
  } catch {
    // Private mode: the choice lasts for this tab only.
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  // Another tab changed the language.
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCALE_STORAGE_KEY && isGlossaryLocale(e.newValue) && e.newValue !== current) {
      current = e.newValue;
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useGlossaryLocale(): GlossaryLocale {
  return useSyncExternalStore(subscribe, read, () => "en");
}

/** Test helper: forget the cached choice so the next read uses storage again. */
export function resetGlossaryLocaleForTests() {
  current = null;
}

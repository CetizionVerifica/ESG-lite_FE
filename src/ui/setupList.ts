/** True when the typed text is the record's name (case and outer spaces ignored). */
export function typedNameMatches(typed: string, name: string): boolean {
  const want = name.trim().toLowerCase();
  return want.length > 0 && typed.trim().toLowerCase() === want;
}

/** Copy of `params` without `keys` (URLSearchParams has no copy-and-drop). */
export function withoutParams(params: URLSearchParams, keys: string[]): URLSearchParams {
  return new URLSearchParams([...params.entries()].filter(([k]) => !keys.includes(k)));
}

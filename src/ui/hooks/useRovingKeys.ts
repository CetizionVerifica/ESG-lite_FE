import { useRef, type KeyboardEvent } from "react";

/** Arrow keys / Home / End move between enabled options and select them (automatic activation). */
export function useRovingKeys<V extends string>(items: { value: V; disabled?: boolean }[], value: V, onChange: (v: V) => void, vertical = false) {
  const refs = useRef<Partial<Record<V, HTMLButtonElement | null>>>({});
  const onKeyDown = (e: KeyboardEvent) => {
    const enabled = items.filter((i) => !i.disabled);
    const idx = enabled.findIndex((i) => i.value === value);
    const prev = vertical ? "ArrowUp" : "ArrowLeft";
    const next = vertical ? "ArrowDown" : "ArrowRight";
    let target: number | null = null;
    if (e.key === next) target = (idx + 1) % enabled.length;
    else if (e.key === prev) target = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = enabled.length - 1;
    if (target === null) return;
    e.preventDefault();
    const v = enabled[target].value;
    onChange(v);
    refs.current[v]?.focus();
  };
  return { refs, onKeyDown };
}


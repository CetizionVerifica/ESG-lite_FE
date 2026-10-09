import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOKEN_NAMES } from "./tokens";

// Read from disk: Vitest's CSS pipeline would strip a `?raw` import.
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

/** `--name: value;` declarations inside the first block that opens with `selector {`. */
function declarations(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf("\n}", start));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

describe("tokens.css", () => {
  const root = declarations(":root");

  it("declares every colour token on :root", () => {
    const missing = TOKEN_NAMES.filter((n) => !root.has(`--t-${n}`));
    expect(missing).toEqual([]);
  });

  it("declares the static type, space, radius and density tokens", () => {
    const names = [
      "--f-ui", "--f-num", "--f-brand",
      ...Array.from({ length: 8 }, (_, i) => `--s-${i + 1}`),
      "--r-sm", "--r-md", "--r-lg", "--row-h",
    ];
    expect(names.filter((n) => !root.has(n))).toEqual([]);
    expect(root.get("--r-sm")).toBe("4px");
    expect(root.get("--r-md")).toBe("8px");
    expect(root.get("--r-lg")).toBe("14px");
    expect(root.get("--row-h")).toBe("36px");
    expect(declarations('[data-density="compact"]').get("--row-h")).toBe("30px");
  });

  it("maps every colour token into Tailwind's @theme", () => {
    const theme = declarations("@theme inline");
    const unmapped = TOKEN_NAMES.filter((n) => theme.get(`--color-${n}`) !== `var(--t-${n})`);
    expect(unmapped).toEqual([]);
  });

  it("keeps Tailwind's own radius and font scales untouched", () => {
    const theme = declarations("@theme inline");
    for (const key of ["--radius-sm", "--radius-md", "--radius-lg", "--font-sans", "--spacing"]) {
      expect(theme.has(key), key).toBe(false);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STATUS,
  accentIsFillOnly,
  buildTheme,
  contrastReport,
  ramp,
  resolveLook,
  statusClashes,
  toCssVars,
} from "./buildTheme";
import { contrast, luminance } from "./color";
import { PLANETPULSE, STORED_BRANDS, packFromBrand } from "./packs";
import type { Look, ResolvedAppearance, ThemePack } from "./packs";
import { RAMP_STEPS, TOKEN_NAMES } from "./tokens";

const LOOKS: Look[] = ["classic", "light", "night"];
const STORED: [string, ThemePack][] = Object.entries(STORED_BRANDS).map(([id, p]) => [
  `company ${id} (${p.name})`,
  p,
]);
const ALL_PACKS: [string, ThemePack][] = [["PlanetPulse", PLANETPULSE], ...STORED];

describe("ramp", () => {
  it("has ten steps, 500 is the input, and gets darker step by step", () => {
    const r = ramp("#0B2E5C");
    expect(Object.keys(r).map(Number)).toEqual([...RAMP_STEPS]);
    expect(r[500]).toBe("#0b2e5c");
    const lum = RAMP_STEPS.map((s) => luminance(r[s]));
    lum.slice(1).forEach((l, i) => expect(l).toBeLessThan(lum[i]));
  });
});

describe("contrast gate", () => {
  describe.each(STORED)("%s", (_name, pack) => {
    it.each(LOOKS)("passes every text and UI pair in the %s look", (look) => {
      const failures = contrastReport(buildTheme(pack, look, "light"))
        .filter((p) => p.ratio < p.min)
        .map((p) => `${p.fg} on ${p.bg}: ${p.ratio.toFixed(2)} < ${p.min}`);
      expect(failures).toEqual([]);
    });
  });

  it.each(LOOKS)("passes for PlanetPulse in the %s look", (look) => {
    const failures = contrastReport(buildTheme(PLANETPULSE, look, "light")).filter(
      (p) => p.ratio < p.min,
    );
    expect(failures).toEqual([]);
  });

  it("passes for the backend's default brand (company without a brand row)", () => {
    const pack = packFromBrand({ companyId: 99, name: "No brand" });
    for (const look of LOOKS) {
      expect(contrastReport(buildTheme(pack, look, "light")).filter((p) => p.ratio < p.min)).toEqual([]);
    }
  });
});

describe("status colours", () => {
  const STATUS_TOKENS = Object.keys(STATUS.light) as (keyof typeof STATUS.light)[];

  it.each<[ResolvedAppearance, Look[]]>([
    ["light", ["classic", "light"]],
    ["dark", ["night"]],
  ])("are identical across all packs (%s)", (appearance, looks) => {
    const expected = STATUS[appearance];
    for (const [, pack] of ALL_PACKS) {
      for (const look of looks) {
        const t = buildTheme(pack, look, appearance);
        for (const name of STATUS_TOKENS) expect(t[name], `${pack.name} ${look} ${name}`).toBe(expected[name]);
      }
    }
  });

  it("match the fixed values in the spec", () => {
    expect([STATUS.light.good, STATUS.light.warn, STATUS.light.bad]).toEqual(["#16794c", "#9a6300", "#b4321f"]);
    expect([STATUS.dark.good, STATUS.dark.warn, STATUS.dark.bad]).toEqual(["#4ccf8f", "#f0b955", "#f38b7a"]);
  });

  it("flags brands whose hue is close to a status hue (rule 6)", () => {
    expect(statusClashes(STORED_BRANDS[1])).toEqual([]);
    expect(statusClashes(STORED_BRANDS[2])).toContain("good");
    expect(statusClashes(STORED_BRANDS[3])).toContain("bad");
    expect(statusClashes(STORED_BRANDS[6])).toContain("warn");
  });
});

describe("generation rules", () => {
  it("returns a hex value for every token", () => {
    for (const [, pack] of ALL_PACKS) {
      for (const look of LOOKS) {
        const t = buildTheme(pack, look, "light");
        expect(Object.keys(t).sort()).toEqual([...TOKEN_NAMES].sort());
        for (const name of TOKEN_NAMES) expect(t[name], name).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("light look: brand is the primary, brand text is brand-600 or darker (rule 2)", () => {
    const t = buildTheme(STORED_BRANDS[1], "light", "light");
    expect(t.brand).toBe("#0b2e5c");
    expect(luminance(t["brand-text"])).toBeLessThanOrEqual(luminance(t["brand-600"]));
    expect(contrast(t["brand-text"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("night look: brand and accent are lifted to the 400 step or lighter (rule 3)", () => {
    for (const [, pack] of ALL_PACKS) {
      const t = buildTheme(pack, "night", "dark");
      const lifted = Math.min(luminance(t["brand-400"]), luminance(t["accent-400"]));
      expect(luminance(t.brand)).toBeGreaterThanOrEqual(lifted - 1e-9);
      expect(luminance(t.accent)).toBeGreaterThanOrEqual(luminance(t["accent-400"]) - 1e-9);
    }
  });

  it("classic look: brand-coloured top bar with white text; light look: white top bar (rule 4)", () => {
    for (const [, pack] of ALL_PACKS) {
      const classic = buildTheme(pack, "classic", "light");
      expect(classic["chrome-fg"]).toBe("#ffffff");
      expect(contrast(classic.chrome, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(buildTheme(pack, "light", "light").chrome).toBe("#ffffff");
    }
    expect(buildTheme(STORED_BRANDS[1], "classic", "light").chrome).toBe("#0b2e5c");
  });

  it("restricts an accent that can't pass as text to fills (Chieron amber)", () => {
    const t = buildTheme(STORED_BRANDS[6], "light", "light");
    expect(accentIsFillOnly(t)).toBe(true);
    expect(contrast(t["on-accent"], t.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("dark appearance always renders the Night look", () => {
    expect(resolveLook("classic", "dark")).toBe("night");
    expect(resolveLook("light", "light")).toBe("light");
    expect(buildTheme(STORED_BRANDS[1], "classic", "dark")).toEqual(
      buildTheme(STORED_BRANDS[1], "night", "light"),
    );
  });

  it("night look: a primary that lifts to grey borrows the accent ramp", () => {
    const midal = buildTheme(STORED_BRANDS[1], "night", "dark");
    expect([midal["accent-400"], midal["accent-300"]]).toContain(midal.brand);
    const chieron = buildTheme(STORED_BRANDS[6], "night", "dark");
    expect([chieron["brand-400"], chieron["brand-300"]]).toContain(chieron.brand);
  });

  it("uses the pack's Scope 3 colour when it has one", () => {
    expect(buildTheme(PLANETPULSE, "night", "dark").s3).toBe("#f39a2b");
  });
});

describe("packFromBrand", () => {
  it("falls back field by field and ignores unknown looks", () => {
    const pack = packFromBrand({
      companyId: 7,
      name: "Acme",
      primary: "not a colour",
      accent: "#ABC",
      defaultLook: "neon",
    });
    expect(pack.primary).toBe("#1f2a44");
    expect(pack.accent).toBe("#aabbcc");
    expect(pack.defaultLook).toBe("light");
    expect(pack.id).toBe("company-7");
  });
});

describe("tokens.css defaults", () => {
  const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    return css.slice(start, css.indexOf("\n}", start));
  };

  it.each<[string, ResolvedAppearance]>([
    [":root", "light"],
    [":root.dark", "dark"],
  ])("%s matches buildTheme(PlanetPulse, %s)", (selector, appearance) => {
    const body = block(selector);
    const vars = toCssVars(buildTheme(PLANETPULSE, "light", appearance));
    const drift = Object.entries(vars).filter(([name, value]) => {
      const m = body.match(new RegExp(`${name}:\\s*([^;]+);`));
      // :root.dark omits the ramps; they are the same in both appearances.
      return m ? m[1].trim() !== value : selector === ":root";
    });
    expect(drift).toEqual([]);
  });
});

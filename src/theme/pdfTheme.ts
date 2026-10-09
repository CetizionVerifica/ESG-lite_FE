import { buildTheme } from "./buildTheme";
import { PLANETPULSE, packFromBrand } from "./packs";
import type { BrandLike, ThemePack } from "./packs";

/**
 * Print colours for @react-pdf reports. Always the Light look on white
 * paper, whatever the user's appearance; a missing brand prints PlanetPulse.
 * @react-pdf can't read CSS variables, so values are plain hex.
 */
export function pdfTheme(brand: BrandLike | ThemePack | null | undefined) {
  const pack: ThemePack = !brand ? PLANETPULSE : "id" in brand ? brand : packFromBrand(brand);
  const t = buildTheme(pack, "light", "light");
  return {
    name: pack.name,
    logoUrl: pack.logoUrl,
    colors: {
      paper: "#ffffff",
      ink: t.ink,
      muted: t.muted,
      line: t.line,
      tint: t.tint,
      brand: t.brand,
      onBrand: t["on-brand"],
      brandText: t["brand-text"],
      accent: t.accent,
      onAccent: t["on-accent"],
      /** Scope 1/2/3, always in this order. */
      scopes: [t.s1, t.s2, t.s3] as [string, string, string],
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => t[`series-${i}` as "series-1"]),
      good: t.good,
      goodSoft: t["good-soft"],
      warn: t.warn,
      warnSoft: t["warn-soft"],
      bad: t.bad,
      badSoft: t["bad-soft"],
      info: t.info,
      infoSoft: t["info-soft"],
    },
    cover: { from: t["cover-from"], to: t["cover-to"], text: "#ffffff" },
    /** Built-in PDF fonts; register IBM Plex with Font.register() to change them. */
    fonts: { ui: "Helvetica", num: "Courier" },
  };
}

export type PdfTheme = ReturnType<typeof pdfTheme>;

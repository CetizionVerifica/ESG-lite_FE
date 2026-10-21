// PE-2 · brand font upload: the pure parts. A guess at family, weight and
// style from the file name, and what still stops the upload (the server checks
// the same and the font's magic bytes).
import { FONT_FAMILY_MAX, FONT_FILE_FORMATS, FONT_MAX_BYTES, type BrandFont, type FontStyle } from "../../../lib/studio/contracts";

export const FONT_ACCEPT = FONT_FILE_FORMATS.map((f) => `.${f}`);

const WEIGHT_WORDS: [RegExp, number][] = [
  [/thin|hairline/, 100],
  [/extra-?light|ultra-?light/, 200],
  [/light/, 300],
  [/medium/, 500],
  [/semi-?bold|demi-?bold/, 600],
  [/extra-?bold|ultra-?bold/, 800],
  [/black|heavy/, 900],
  [/bold/, 700],
];

/** A file-name part that names a weight or style ("SemiBold", "BoldItalic", "Regular"). */
const STYLE_PART = /^(thin|hairline|regular|book|normal|medium|black|heavy|italic|oblique|(extra|ultra|semi|demi)?(bold|light))(italic|oblique)?$/i;

export const WEIGHT_NAMES: Record<number, string> = { 100: "Thin", 200: "Extra light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" };

/** "MidalSans-BoldItalic.woff2" → {family "Midal Sans", weight 700, style "italic"}. */
export function fontFromFileName(name: string): { family: string; weight: number; style: FontStyle } {
  const parts = name.replace(/\.[^.]+$/, "").split(/[-_ ]+/).filter(Boolean);
  const rest: string[] = [];
  while (parts.length > 1 && STYLE_PART.test(parts[parts.length - 1])) rest.unshift(parts.pop() as string);
  const familyPart = parts.join(" ");
  const tail = rest.join(" ").toLowerCase();
  const style: FontStyle = /italic|oblique/.test(tail) ? "italic" : "normal";
  const weight = WEIGHT_WORDS.find(([re]) => re.test(tail))?.[1] ?? 400;
  const family = familyPart
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FONT_FAMILY_MAX);
  return { family, weight, style };
}

/** Why the upload can't be sent yet, or null. */
export function uploadProblem(file: File | null, family: string, licence: boolean): string | null {
  if (!file) return "Choose a WOFF2, TTF or OTF file.";
  if (!FONT_ACCEPT.some((ext) => file.name.toLowerCase().endsWith(ext))) return "Upload a WOFF2, TTF or OTF font.";
  if (file.size > FONT_MAX_BYTES) return "Fonts can be up to 5 MB.";
  if (!family.trim()) return "Name the font family.";
  if (family.trim().length > FONT_FAMILY_MAX) return `Keep the family name to ${FONT_FAMILY_MAX} characters.`;
  if (!licence) return "Confirm that your company holds a licence to embed this font in PDFs.";
  return null;
}

/** "4 weights" / "Regular and Bold Italic". */
export function fontFilesLine(f: BrandFont): string {
  if (f.files.length > 2) return `${f.files.length} weights and styles`;
  return f.files.map((x) => `${WEIGHT_NAMES[x.weight] ?? x.weight}${x.style === "italic" ? " italic" : ""}`).join(" and ");
}

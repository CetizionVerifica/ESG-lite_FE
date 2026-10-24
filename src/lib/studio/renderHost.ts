/**
 * DS-1 · drawing renderer output in the app. The renderer itself is the
 * generated mirror in ./render (never edit it); this file only hosts it:
 *
 *   mountSheet(host, page, doc, data, opts)  one free-form page in an open
 *       shadow root (the editor sheet, DS-6; thumbnails), so report CSS never
 *       leaks into the app and app CSS never reaches the report.
 *   mountFlow(host, section, doc, data, opts) one flow section, unpaginated.
 *   measureSheet(root)                        window.__measure for a mounted root.
 *   ensureStudioFonts(ids)                    loads the bundled faces from
 *       GET /studio/fonts/:file with the session's token (an @font-face URL
 *       can't send it) and adds them to document.fonts, which shadow roots share.
 *   setStudioCustomFonts / ensureCustomFonts  PE-2: the company's uploaded brand
 *       fonts. Every mount gets them as `customFonts` (so `custom:<id>` boxes use
 *       "DS Brand <id>"), and their files load into document.fonts the same way.
 *
 * Page view, Present and the PDFs are the backend's html.ts / print.ts (DS-11).
 */
import api from "../../api/axios";
import { FONTS, customFontFamily, fontFile, renderFlow, renderSheet, type FontId, type RenderCustomFont, type Measurement, type RenderBrand, type RenderData, type RenderDoc, type RenderFlowSection, type RenderFreeformPage, type RenderOptions, type RenderStyle } from "./render";
import { MEASURE_JS } from "./render/measure";

export interface MountOptions extends Omit<RenderOptions, "mode"> {
  brand?: RenderBrand | null;
  style?: RenderStyle | null;
}

const rootOf = (host: HTMLElement): ShadowRoot => host.shadowRoot ?? host.attachShadow({ mode: "open" });

function paint(host: HTMLElement, css: string, html: string): ShadowRoot {
  const root = rootOf(host);
  // Trusted: the renderer escapes every text and attribute it emits (layer rule 7).
  root.innerHTML = `<style>:host{display:block;}${css}</style>${html}`;
  return root;
}

/** Renders one free-form page into `host`'s shadow root (created on first use) and returns the root. */
export function mountSheet(host: HTMLElement, page: RenderFreeformPage, doc: RenderDoc, data: RenderData | null, opts: MountOptions = {}): ShadowRoot {
  const { brand, style, ...rest } = opts;
  const r = renderSheet(page, doc, data, { ...withCustomFonts(rest), mode: "sheet" }, brand, style);
  return paint(host, r.css, r.html);
}

/** Renders one flow section (unpaginated) into `host`'s shadow root. */
export function mountFlow(host: HTMLElement, section: RenderFlowSection, doc: RenderDoc, data: RenderData | null, opts: MountOptions = {}): ShadowRoot {
  const { brand, style, ...rest } = opts;
  const r = renderFlow(section, doc, data, { ...withCustomFonts(rest), mode: "sheet" }, brand, style);
  return paint(host, r.css, r.html);
}

type MeasureWindow = { __measure?: (root?: ParentNode) => Measurement[]; Function: FunctionConstructor };

/** Runs the renderer's measuring script over a mounted root (installs it once per window). */
export function measureSheet(root: ParentNode, win: Window = window): Measurement[] {
  const w = win as unknown as MeasureWindow;
  if (typeof w.__measure !== "function") new w.Function(MEASURE_JS)();
  return w.__measure ? w.__measure(root) : [];
}

const loaded = new Map<string, Promise<boolean>>();

/** The URL path the API serves a face from. */
export const studioFontPath = (id: FontId, weight: number): string => `/studio/fonts/${fontFile(id, weight)}`;

/**
 * Loads every weight of the given faces once per session and adds them to
 * document.fonts. Resolves to the faces that loaded; a face that fails falls
 * back to the stack (Noto Sans, then the generic family) and is retried next time.
 */
export async function ensureStudioFonts(ids: FontId[], fontSet: FontFaceSet | undefined = typeof document !== "undefined" ? document.fonts : undefined): Promise<FontId[]> {
  if (typeof FontFace === "undefined" || !fontSet) return [];
  const want = [...new Set([...ids, "noto-sans" as FontId])].filter((id) => FONTS[id]);
  const results = await Promise.all(
    want.map(async (id) => {
      const oks = await Promise.all(
        FONTS[id].weights.map((weight) => {
          const key = `${id}-${weight}`;
          let p = loaded.get(key);
          if (!p) {
            p = api
              .get<ArrayBuffer>(studioFontPath(id, weight), { responseType: "arraybuffer" })
              .then(async (res) => {
                const face = new FontFace(FONTS[id].family, res.data, { weight: String(weight), style: "normal", display: "block" });
                await face.load();
                fontSet.add(face);
                return true;
              })
              .catch(() => {
                // data-loss-reviewed: removes an entry from an in-memory Set/Map, no record is deleted.
                loaded.delete(key);
                return false;
              });
            loaded.set(key, p);
          }
          return p;
        }),
      );
      return oks.every(Boolean) ? id : null;
    }),
  );
  return results.filter((id): id is FontId => id !== null);
}

/** Test hook: forget loaded faces. */
export const resetStudioFonts = (): void => loaded.clear();

// ---------------------------------------------------------------------------
// PE-2 · uploaded brand fonts (`custom:<id>` in a text box's `font`)
// ---------------------------------------------------------------------------

let customFonts: RenderCustomFont[] = [];
let customVersion = 0;
const customListeners = new Set<() => void>();

/** The mount options with the company's uploaded fonts, unless the caller passed its own. */
function withCustomFonts<T extends Omit<RenderOptions, "mode">>(opts: T): T {
  return opts.customFonts || !customFonts.length ? opts : { ...opts, customFonts };
}

/** Sets the uploaded fonts every mount renders with (a ref not listed falls back to the style's font). */
export function setStudioCustomFonts(fonts: RenderCustomFont[]): void {
  if (JSON.stringify(fonts) === JSON.stringify(customFonts)) return;
  customFonts = fonts;
  customVersion += 1;
  customListeners.forEach((l) => l());
}
export const studioCustomFonts = (): RenderCustomFont[] => customFonts;
/** Subscribe to changes of the uploaded fonts (useSyncExternalStore: sheets render again). */
export const subscribeCustomFonts = (l: () => void): (() => void) => {
  customListeners.add(l);
  // data-loss-reviewed: removes an entry from an in-memory Set/Map, no record is deleted.
  return () => customListeners.delete(l);
};
export const customFontsVersion = (): number => customVersion;

const loadedCustom = new Map<string, Promise<boolean>>();

/**
 * Loads every file of the given uploaded fonts once per session (with the
 * session's token, like the bundled faces) and adds them to document.fonts
 * under the renderer's own family name ("DS Brand <id>"). Resolves to the refs
 * whose files all loaded; a file that fails is retried next time.
 */
export async function ensureCustomFonts(
  fonts: RenderCustomFont[],
  load: (url: string) => Promise<ArrayBuffer> = async (url) => (await api.get<ArrayBuffer>(url, { responseType: "arraybuffer" })).data,
  fontSet: FontFaceSet | undefined = typeof document !== "undefined" ? document.fonts : undefined,
): Promise<string[]> {
  if (typeof FontFace === "undefined" || !fontSet) return [];
  const results = await Promise.all(
    fonts.map(async (f) => {
      const family = customFontFamily(f.ref);
      if (!family) return null;
      const oks = await Promise.all(
        f.files.map((file) => {
          const key = `${f.ref}|${file.url}`;
          let p = loadedCustom.get(key);
          if (!p) {
            p = load(file.url)
              .then(async (buf) => {
                const face = new FontFace(family, buf, { weight: String(file.weight), style: file.style, display: "block" });
                await face.load();
                fontSet.add(face);
                return true;
              })
              .catch(() => {
                // data-loss-reviewed: removes an entry from an in-memory Set/Map, no record is deleted.
                loadedCustom.delete(key);
                return false;
              });
            loadedCustom.set(key, p);
          }
          return p;
        }),
      );
      return oks.every(Boolean) ? f.ref : null;
    }),
  );
  return results.filter((r): r is string => r !== null);
}

/** Test hook: forget the uploaded fonts and their loaded faces. */
export const resetCustomFonts = (): void => {
  loadedCustom.clear();
  setStudioCustomFonts([]);
};

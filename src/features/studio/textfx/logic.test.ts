import { describe, expect, it } from "vitest";
import type { BrandFont, Element, ReportDoc } from "../../../lib/studio/contracts";
import { activeEffects, effectColours, fontOptions, fontRefOf, renderCustomFonts, setEffectValue, setTextEffects, setTextFont, toggleEffect } from "./logic";

const C = { ink: "#111111", highlight: "#eeeeee" };
const text = (id: string, extra: Partial<Element> = {}): Element =>
  ({ id, type: "text", frame: { x: 0, y: 0, w: 50, h: 10, rotation: 0 }, z: 0, source: "user", props: { style: "body", align: "left", doc: { type: "doc", content: [] } }, ...extra }) as unknown as Element;
const doc = (): ReportDoc =>
  ({
    v: 2,
    kind: "ghg",
    format: "a4",
    meta: { title: "R", year: 2025, yearType: "CY", sites: "all", frameworks: [] },
    design: { theme: {} },
    assets: [],
    pages: [{ id: "p", kind: "freeform", name: "P", background: {}, elements: [text("a"), text("b"), text("lock", { locked: true }), { ...text("c"), type: "callout" } as Element] }],
  }) as unknown as ReportDoc;
const props = (d: ReportDoc, id: string) => (d.pages[0] as Extract<ReportDoc["pages"][number], { kind: "freeform" }>).elements.find((e) => e.id === id)?.props as Record<string, unknown>;

describe("text effects (PE-2)", () => {
  it("shadow and lift exclude each other; turning the last effect off removes `effects`", () => {
    const s = toggleEffect(undefined, "shadow", true, C);
    expect(s).toEqual({ shadow: { blur: 16, offsetX: 6, offsetY: 6, colour: "#111111", opacity: 40 } });
    const l = toggleEffect({ ...s, outline: { width: 10, colour: "#000000" } }, "lift", true, C);
    expect(activeEffects(l)).toEqual(["lift", "outline"]);
    expect(toggleEffect(toggleEffect(l, "lift", false, C), "outline", false, C)).toBeUndefined();
    expect(toggleEffect(undefined, "highlight", true, C)).toEqual({ highlight: { colour: "#eeeeee", radius: 30 } });
  });

  it("slider values are integers clamped to the contract's ranges; an effect that is off isn't touched", () => {
    const s = toggleEffect(undefined, "shadow", true, C);
    expect(setEffectValue(s, "shadow", { offsetX: -140.6, blur: 33.4 })?.shadow).toMatchObject({ offsetX: -100, blur: 33 });
    expect(setEffectValue({ curve: { radius: 0 } }, "curve", { radius: -250 })?.curve).toEqual({ radius: -100 });
    expect(setEffectValue(s, "lift", { intensity: 50 })).toBe(s);
  });

  it("sets effects and fonts on unlocked text boxes only; undefined removes the prop; no change keeps the doc", () => {
    const d = doc();
    const fx = { lift: { intensity: 40 } };
    const next = setTextEffects(d, "p", ["a", "lock", "c"], fx);
    expect(props(next, "a").effects).toEqual(fx);
    expect(props(next, "lock").effects).toBeUndefined();
    expect(props(next, "c").effects).toBeUndefined();
    expect(setTextEffects(next, "p", ["a"], fx)).toBe(next);
    expect("effects" in props(setTextEffects(next, "p", ["a"], undefined), "a")).toBe(false);
    const f = setTextFont(d, "p", ["a", "b"], "custom:3");
    expect([props(f, "a").font, props(f, "b").font]).toEqual(["custom:3", "custom:3"]);
    expect("font" in props(setTextFont(f, "p", ["a"], undefined), "a")).toBe(false);
  });

  it("effect colours come from the report theme: ink, a light accent for highlights with its contrast", () => {
    const c = effectColours({ ...doc(), design: { theme: { colors: { ink: "#101010", accent: "#0f766e", primary: "#1e3a8a" } } } } as unknown as ReportDoc, null);
    expect(c.ink).toBe("#101010");
    expect(c.highlight).toMatch(/^#[0-9a-f]{6}$/);
    expect(c.contrast).toBeGreaterThan(4.5);
    expect(c.swatches).toContain("#0f766e");
  });
});

describe("fonts per text box (PE-2)", () => {
  const midal = { id: 4, ref: "custom:4", family: "Midal Sans", files: [{ assetId: "f", weight: 700, style: "italic", format: "woff2", bytes: 9, url: "/studio/brand-kit/fonts/4/files/f" }] } as unknown as BrandFont;

  it("lists the style font, the bundled faces and the uploaded ones; a deleted font shows why it falls back", () => {
    const opts = fontOptions([midal], undefined);
    expect(opts[0]).toEqual({ value: "", label: "Style font" });
    expect(opts[opts.length - 1]).toEqual({ value: "custom:4", label: "Midal Sans (uploaded)" });
    expect(opts.some((o) => o.value === "ibm-plex-sans")).toBe(true);
    expect(fontOptions([], "custom:9").slice(-1)[0]).toEqual({ value: "custom:9", label: "Removed font (uses the style font)" });
  });

  it("reads picker values as font refs and brand fonts as the renderer's customFonts", () => {
    expect([fontRefOf(""), fontRefOf(null), fontRefOf("fraunces"), fontRefOf("custom:4"), fontRefOf("custom:x"), fontRefOf("comic-sans")]).toEqual([undefined, undefined, "fraunces", "custom:4", undefined, undefined]);
    expect(renderCustomFonts([midal])).toEqual([{ ref: "custom:4", family: "Midal Sans", files: [{ weight: 700, style: "italic", format: "woff2", url: "/studio/brand-kit/fonts/4/files/f" }] }]);
  });
});

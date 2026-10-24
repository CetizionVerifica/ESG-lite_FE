import { describe, expect, it } from "vitest";
import fixture from "../../test/fixtures/studio/ghg-doc.json";
import type { FreeformPage, ReportDoc } from "./contracts";
import { applyBackgroundRemoved, beforeElement, brandDuotones, clampAdjust, hasPhotoEdits, isPhotoElement, resetPhotoEdits, restoreOriginal, setDuotone, setImageAdjust, setImageFilter, shade, signed, tint, type PhotoElement } from "./photoOps";

const base = fixture as unknown as ReportDoc;
const PAGE = "p-cover";
const ID = "p-cover.bg";
const pic = (doc: ReportDoc): PhotoElement => {
  const el = (doc.pages.find((p) => p.id === PAGE) as FreeformPage).elements.find((e) => e.id === ID);
  if (!isPhotoElement(el)) throw new Error("no picture");
  return el;
};

describe("photoOps", () => {
  it("sets a slider, clamps it, and drops zero values", () => {
    let doc = setImageAdjust(base, PAGE, pic(base), "brightness", 12);
    expect(pic(doc).props.adjust).toEqual({ brightness: 12 });
    expect(setImageAdjust(doc, PAGE, pic(doc), "blur", -20)).toBe(doc); // blur clamps to 0 = unchanged
    doc = setImageAdjust(doc, PAGE, pic(doc), "contrast", 400);
    expect(pic(doc).props.adjust).toEqual({ brightness: 12, contrast: 100 });
    doc = setImageAdjust(doc, PAGE, pic(doc), "brightness", 0);
    doc = setImageAdjust(doc, PAGE, pic(doc), "contrast", 0);
    expect(pic(doc).props.adjust).toBeUndefined();
    expect(clampAdjust("warmth", 4.6)).toBe(5);
  });

  it("returns the same doc when nothing changes", () => {
    expect(setImageAdjust(base, PAGE, pic(base), "saturation", 0)).toBe(base);
    expect(setImageFilter(base, PAGE, pic(base), "none")).toBe(base);
    expect(setDuotone(base, PAGE, pic(base), null)).toBe(base);
    expect(resetPhotoEdits(base, PAGE, pic(base))).toBe(base);
    expect(restoreOriginal(base, PAGE, pic(base))).toBe(base);
  });

  it("sets and clears the filter preset and duotone; rejects bad colours", () => {
    let doc = setImageFilter(base, PAGE, pic(base), "mono");
    expect(pic(doc).props.filter).toBe("mono");
    doc = setDuotone(doc, PAGE, pic(doc), { dark: "#0B2E4F", light: "#e6f0fa" });
    expect(pic(doc).props.duotone).toEqual({ dark: "#0b2e4f", light: "#e6f0fa" });
    expect(setDuotone(doc, PAGE, pic(doc), { dark: "#0b2e4f", light: "#E6F0FA" })).toBe(doc);
    expect(setDuotone(doc, PAGE, pic(doc), { dark: "navy", light: "#ffffff" })).toBe(doc);
    expect(hasPhotoEdits(pic(doc).props)).toBe(true);
    doc = resetPhotoEdits(doc, PAGE, pic(doc));
    expect(hasPhotoEdits(pic(doc).props)).toBe(false);
    expect(JSON.parse(JSON.stringify(pic(doc).props))).toEqual(JSON.parse(JSON.stringify(pic(base).props)));
  });

  it("keeps the original asset through background removals and restores it", () => {
    let doc = applyBackgroundRemoved(base, PAGE, pic(base), "a-plant-nobg-1");
    expect(pic(doc).props).toMatchObject({ assetId: "a-plant-nobg-1", originalAssetId: "a-plant" });
    doc = applyBackgroundRemoved(doc, PAGE, pic(doc), "a-plant-nobg-2");
    expect(pic(doc).props).toMatchObject({ assetId: "a-plant-nobg-2", originalAssetId: "a-plant" });
    doc = restoreOriginal(doc, PAGE, pic(doc));
    expect(pic(doc).props.assetId).toBe("a-plant");
    expect(pic(doc).props.originalAssetId).toBeUndefined();
  });

  it("builds the before element: original picture, no edits", () => {
    let doc = applyBackgroundRemoved(base, PAGE, pic(base), "nobg");
    doc = setImageFilter(doc, PAGE, pic(doc), "vivid");
    doc = setImageAdjust(doc, PAGE, pic(doc), "warmth", 30);
    const before = beforeElement(pic(doc));
    expect(before.props).toEqual({ ...pic(base).props });
    expect(pic(doc).props.filter).toBe("vivid"); // the doc element is untouched
  });

  it("makes brand duotone pairs from the kit colours", () => {
    const pairs = brandDuotones({ primary: "#2572c0", accent: "#2572C0", coverFrom: "#0b2e4f", coverTo: "#2572c0" });
    expect(pairs.map((p) => p.name)).toEqual(["Primary", "Cover", "Primary and accent"]);
    expect(pairs[0]).toEqual({ name: "Primary", dark: shade("#2572c0", 0.35), light: tint("#2572c0", 0.85) });
    expect(brandDuotones(null)).toEqual([]);
    expect(brandDuotones({}, ["#112233", "bad"])).toHaveLength(1);
    expect(tint("#000000", 1)).toBe("#ffffff");
    expect(shade("#ffffff", 1)).toBe("#000000");
  });

  it("formats slider values as the mockup does", () => {
    expect([signed(12), signed(-5), signed(0)]).toEqual(["+12", "−5", "0"]);
  });
});

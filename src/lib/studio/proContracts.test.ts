import { describe, expect, it } from "vitest";
import snapshot from "./contracts.snapshot.json";
import * as c from "./contracts";

/** PRO-0: the Pro editing mirror (ESG-lite src/studio/contracts/proProps.ts and pro.ts). */
describe("PRO-0 contracts mirror", () => {
  it("carries the PRO-0 enums and error codes of the backend snapshot", () => {
    const fe = c as unknown as Record<string, unknown>;
    for (const name of ["IMAGE_FILTERS", "IMAGE_ADJUST_KEYS", "TEXT_EFFECTS", "BRIEF_PURPOSES", "BRIEF_AUDIENCES", "BRIEF_LENGTHS", "BRIEF_TONES", "READINESS_BADGE_KEYS", "READINESS_LEVELS", "LAYOUT_OPTION_IDS", "SWAP_PAGE_STATUSES", "IMAGE_JOB_KINDS", "FONT_FILE_FORMATS", "FONT_WEIGHTS", "FONT_STYLES"]) {
      expect(fe[name], name).toEqual((snapshot.enums as Record<string, unknown>)[name]);
    }
    expect(c.DS_ERROR_STATUS.DS_BG_UNAVAILABLE).toBe(503);
    expect(c.DS_ERROR_STATUS.DS_NOT_BUILT).toBe(501);
  });

  it("tells a custom font ref from a bundled font", () => {
    expect(c.isCustomFontRef("custom:12")).toBe(true);
    for (const v of ["custom:", "custom:0", "custom:x", "ibm-plex-sans", 12]) expect(c.isCustomFontRef(v), String(v)).toBe(false);
  });

  it("types the new element props as optional (old elements still type-check)", () => {
    const img: c.ElementPropsByType["image"] = { assetId: "a", fit: "cover", alt: "" };
    const edited: c.ElementPropsByType["image"] = { ...img, adjust: { brightness: 12 }, filter: "mono", duotone: null, originalAssetId: "a0" };
    const text: c.ElementPropsByType["text"] = { doc: { type: "doc", content: [] }, style: "body", align: "left", effects: { curve: { radius: 30 } }, font: "custom:3" };
    expect([edited.filter, text.font, c.IMAGE_ADJUST_RANGE.blur]).toEqual(["mono", "custom:3", [0, 100]]);
  });
});

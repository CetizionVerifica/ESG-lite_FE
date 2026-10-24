import { describe, expect, it } from "vitest";
import type { BrandFont } from "../../../lib/studio/contracts";
import { fontFilesLine, fontFromFileName, uploadProblem } from "./fontLogic";

const file = (name: string, size = 10) => ({ name, size }) as File;

describe("brand font upload (PE-2)", () => {
  it("guesses family, weight and style from the file name", () => {
    expect(fontFromFileName("MidalSans-BoldItalic.woff2")).toEqual({ family: "Midal Sans", weight: 700, style: "italic" });
    expect(fontFromFileName("Acme_Display_SemiBold.ttf")).toEqual({ family: "Acme Display", weight: 600, style: "normal" });
    expect(fontFromFileName("Brand-ExtraLight.otf")).toEqual({ family: "Brand", weight: 200, style: "normal" });
    expect(fontFromFileName("Brand.woff2")).toEqual({ family: "Brand", weight: 400, style: "normal" });
  });

  it("names what still stops the upload: file, type, size, family, licence", () => {
    expect(uploadProblem(null, "A", true)).toBe("Choose a WOFF2, TTF or OTF file.");
    expect(uploadProblem(file("a.zip"), "A", true)).toBe("Upload a WOFF2, TTF or OTF font.");
    expect(uploadProblem(file("a.woff2", 6 * 1024 * 1024), "A", true)).toBe("Fonts can be up to 5 MB.");
    expect(uploadProblem(file("a.woff2"), "  ", true)).toBe("Name the font family.");
    expect(uploadProblem(file("a.woff2"), "A", false)).toBe("Confirm that your company holds a licence to embed this font in PDFs.");
    expect(uploadProblem(file("a.OTF"), "A", true)).toBeNull();
  });

  it("describes a family's files", () => {
    const f = (files: { weight: number; style: string }[]) => ({ files }) as unknown as BrandFont;
    expect(fontFilesLine(f([{ weight: 400, style: "normal" }, { weight: 700, style: "italic" }]))).toBe("Regular and Bold italic");
    expect(fontFilesLine(f([1, 2, 3, 4].map((i) => ({ weight: i * 100, style: "normal" }))))).toBe("4 weights and styles");
  });
});

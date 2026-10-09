import { describe, expect, it } from "vitest";
import { checkFiles, formatBytes, isPreviewable } from "./fileRules";
import { matchUnit } from "./unitMatch";

const f = (name: string, type: string, size = 100) => new File([new Uint8Array(size)], name, { type });

describe("checkFiles", () => {
  const pdf = f("bill.pdf", "application/pdf");
  const png = f("meter.png", "image/png");
  const xlsx = f("rows.XLSX", "");
  const exe = f("x.exe", "application/x-msdownload");

  it("accepts by MIME, wildcard and extension", () => {
    const { ok, rejected } = checkFiles([pdf, png, xlsx, exe], { accept: ["application/pdf", "image/*", ".xlsx"] });
    expect(ok).toEqual([pdf, png, xlsx]);
    expect(rejected).toEqual([{ file: exe, reason: "This file type isn't allowed." }]);
  });

  it("rejects files over the size limit and beyond the count", () => {
    const big = f("big.pdf", "application/pdf", 3 * 1024 * 1024);
    expect(checkFiles([big], { maxSize: 2 * 1024 * 1024 }).rejected[0].reason).toBe("Larger than 2.0 MB.");
    expect(checkFiles([pdf, png], { multiple: false }).rejected[0].reason).toBe("Only one file allowed.");
    expect(checkFiles([pdf, png], { maxFiles: 3 }, 2).rejected[0].reason).toBe("At most 3 files.");
  });

  it("formats sizes and spots previewable types", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(isPreviewable("image/jpeg")).toBe("image");
    expect(isPreviewable("application/pdf")).toBe("pdf");
    expect(isPreviewable("text/csv")).toBeNull();
  });
});

describe("matchUnit", () => {
  it("follows utils/unitConversions", () => {
    expect(matchUnit("kWh", "kwh")).toEqual({ state: "ok" });
    expect(matchUnit("mwh", "kwh")).toEqual({ state: "convertible", factor: 1000 });
    expect(matchUnit("litre", "kwh")).toEqual({ state: "mismatch" });
    expect(matchUnit("", "kwh")).toEqual({ state: "ok" });
  });
});

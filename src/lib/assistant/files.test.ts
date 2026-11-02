// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { ASSISTANT_MAX_FILE_CHARS } from "./contracts";
import { MAX_SOURCE_BYTES, clipText, fileTypeOf, humanSize, looksLikeJunk, prepareFile, xmlToText } from "./files";
import "../../test/fileShim";

const named = (parts: BlobPart[], name: string, type = "") => new File(parts, name, { type });

function zipped(entries: Record<string, string>): Uint8Array {
  const zip = XLSX.CFB.utils.cfb_new();
  for (const [path, xml] of Object.entries(entries)) XLSX.CFB.utils.cfb_add(zip, path, new TextEncoder().encode(xml));
  return Uint8Array.from(XLSX.CFB.write(zip, { type: "array", fileType: "zip" }) as number[]);
}

describe("what kind of file it is", () => {
  it("goes by the extension, then the browser's type", () => {
    expect(fileTypeOf("Bill.PDF")).toBe("pdf");
    expect(fileTypeOf("a.jpeg")).toBe("image");
    expect(fileTypeOf("fuel.xlsx")).toBe("spreadsheet");
    expect(fileTypeOf("fuel.csv")).toBe("csv");
    expect(fileTypeOf("report.docx")).toBe("word");
    expect(fileTypeOf("deck.pptx")).toBe("slides");
    expect(fileTypeOf("notes", "text/plain")).toBe("text");
    expect(fileTypeOf("pasted", "image/png")).toBe("image");
    expect(fileTypeOf("drawing.dwg")).toBe("other");
  });
});

describe("text", () => {
  it("clips to what the server takes and says so", () => {
    expect(clipText(" hi \r\nthere ")).toEqual({ text: "hi \nthere", truncated: false });
    const long = clipText("x".repeat(ASSISTANT_MAX_FILE_CHARS + 5));
    expect(long.text).toHaveLength(ASSISTANT_MAX_FILE_CHARS);
    expect(long.truncated).toBe(true);
  });
  it("takes the words out of Word and PowerPoint XML", () => {
    expect(xmlToText('<w:p><w:r><w:t>Diesel &amp; petrol</w:t></w:r></w:p><w:p><w:t>12 &lt; 20</w:t></w:p>')).toBe("Diesel & petrol\n12 < 20");
    expect(xmlToText("<a:p><a:t>Slide one</a:t></a:p>")).toBe("Slide one");
  });
  it("sizes read naturally", () => {
    expect(humanSize(100)).toBe("1 KB");
    expect(humanSize(2048)).toBe("2 KB");
    expect(humanSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("reading a file", () => {
  it("a CSV becomes its text", async () => {
    const r = await prepareFile(named(["month,litres\nSep,1200\n"], "fuel.csv", "text/csv"));
    expect(r.attachment).toEqual({ name: "fuel.csv", type: "csv", text: "month,litres\nSep,1200", truncated: false });
    expect(r.note).toBe("Read the file");
  });

  it("a spreadsheet becomes its sheets as text", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Month", "Litres"], ["Sep", 1200]]), "Diesel");
    const r = await prepareFile(named([XLSX.write(book, { type: "array", bookType: "xlsx" })], "fuel.xlsx"));
    expect(r.attachment.text).toBe("Sheet: Diesel\nMonth,Litres\nSep,1200");
    expect(r.note).toBe("Read 1 sheet");
  });

  it("a long spreadsheet says only the first rows were read", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(Array.from({ length: 400 }, (_, i) => [`row ${i}`])), "Long");
    const r = await prepareFile(named([XLSX.write(book, { type: "array", bookType: "xlsx" })], "long.xlsx"));
    expect(r.attachment.truncated).toBe(true);
    expect(r.note).toBe("Read 1 sheet, the first rows");
    expect(r.attachment.text).not.toContain("row 300");
  });

  it("Word and PowerPoint files give their text, slides in order", async () => {
    const word = await prepareFile(named([zipped({ "word/document.xml": "<w:p><w:t>Plant report</w:t></w:p>", "word/styles.xml": "<w:t>noise</w:t>" }) as BlobPart], "report.docx"));
    expect(word.attachment.text).toBe("Plant report");
    expect(word.note).toBe("Read the document");
    const slides = await prepareFile(
      named([zipped({ "ppt/slides/slide10.xml": "<a:p><a:t>Ten</a:t></a:p>", "ppt/slides/slide2.xml": "<a:p><a:t>Two</a:t></a:p>" }) as BlobPart], "deck.pptx"),
    );
    expect(slides.attachment.text).toBe("Two\n\nTen");
    expect(slides.note).toBe("Read 2 slides");
  });

  it("any other file still attaches, by name", async () => {
    const r = await prepareFile(named(["binary"], "plan.dwg"));
    expect(r.attachment).toEqual({ name: "plan.dwg", type: "other", unread: "type" });
    expect(r.note).toMatch(/going by its name/);
  });

  it("a file that won't open, or is too big, goes by its name and never throws", async () => {
    const broken = await prepareFile(named(["not a zip"], "broken.docx"));
    expect(broken.attachment.text).toBeUndefined();
    expect(broken.note).toMatch(/Couldn't open this file/);
    const huge = named(["x"], "huge.pdf");
    Object.defineProperty(huge, "size", { value: MAX_SOURCE_BYTES + 1 });
    const big = await prepareFile(huge);
    expect(big.attachment).toEqual({ name: "huge.pdf", type: "pdf", unread: "too_big" });
    expect(big.note).toMatch(/Too big to read/);
  });

  it("says a file is empty or damaged instead of claiming to have read it", async () => {
    for (const name of ["empty.txt", "empty.pdf", "empty.xlsx", "empty.docx", "empty.png"]) {
      const r = await prepareFile(named([], name));
      expect(r.attachment.unread, name).toBe("empty");
      expect(r.note).toMatch(/This file is empty/);
    }
    const blank = new TextEncoder().encode("   \n  ");
    expect((await prepareFile(named([blank], "spaces.txt"))).attachment.unread).toBe("empty");
    const sheet = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(sheet, XLSX.utils.aoa_to_sheet([]), "Sheet1");
    expect((await prepareFile(named([XLSX.write(sheet, { type: "array", bookType: "xlsx" })], "no-rows.xlsx"))).attachment.unread).toBe("empty");

    const junk = Uint8Array.from({ length: 2000 }, (_, i) => (i * 37) % 32);
    const damaged = await prepareFile(named([junk], "damaged.xlsx"));
    expect(damaged.attachment).toEqual({ name: "damaged.xlsx", type: "spreadsheet", unread: "damaged" });
    expect(damaged.note).toMatch(/Couldn't open this file/);
    expect((await prepareFile(named([junk], "damaged.txt"))).attachment.unread).toBe("damaged");
  });

  it("tells words from bytes", () => {
    expect(looksLikeJunk("Diesel,815,L\nरसीद 12\n")).toBe(false);
    expect(looksLikeJunk(`Page 1\f${"text ".repeat(20)}`)).toBe(false);
    expect(looksLikeJunk(`abc${String.fromCharCode(0, 1, 2, 3)}�`)).toBe(true);
  });

  it("a very long name is shortened to what the server takes, keeping its end", async () => {
    const r = await prepareFile(named(["a,b"], `${"long".repeat(50)}.csv`));
    expect(r.attachment.name.length).toBeLessThanOrEqual(120);
    expect(r.attachment.name.endsWith(".csv")).toBe(true);
  });
});

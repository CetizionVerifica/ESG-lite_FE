import { describe, expect, it } from "vitest";
import { fileNameFrom } from "./exportTable";

describe("fileNameFrom", () => {
  it("reads the file name from a Content-Disposition header, else falls back", () => {
    expect(fileNameFrom('attachment; filename="Rod-12-v1.pact.json"', "x")).toBe("Rod-12-v1.pact.json");
    expect(fileNameFrom("attachment; filename*=UTF-8''Rod%2012.csv", "x")).toBe("Rod 12.csv");
    expect(fileNameFrom(null, "fallback.csv")).toBe("fallback.csv");
  });
});

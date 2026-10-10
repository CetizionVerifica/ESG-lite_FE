import { describe, expect, it } from "vitest";
import { typedNameMatches, withoutParams } from "./setupList";

describe("typedNameMatches", () => {
  it("matches ignoring case and outer spaces", () => {
    expect(typedNameMatches("  pune plant ", "Pune Plant")).toBe(true);
  });
  it("rejects partial or empty text", () => {
    expect(typedNameMatches("Pune", "Pune Plant")).toBe(false);
    expect(typedNameMatches("", "")).toBe(false);
  });
});

describe("withoutParams", () => {
  it("drops only the given keys and leaves the original alone", () => {
    const p = new URLSearchParams("q=a&open=3&client=2");
    expect(withoutParams(p, ["open"]).toString()).toBe("q=a&client=2");
    expect(p.get("open")).toBe("3");
  });
});

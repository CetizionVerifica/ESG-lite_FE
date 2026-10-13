// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { clearEntryDrafts, entryDraftKey } from "./entryDrafts";

afterEach(() => sessionStorage.clear());

describe("entry drafts", () => {
  it("keys a draft by user, site, category and period", () => {
    expect(entryDraftKey(7, 4, 9, "2025-09")).toBe("add-data:7:4:9:2025-09");
    expect(entryDraftKey(null, 4, 9, "FY2025")).toBe("add-data:anon:4:9:FY2025");
  });

  it("signing out removes every Add data draft and nothing else", () => {
    sessionStorage.setItem("add-data:7:4:9:2025-09", "[]");
    sessionStorage.setItem("add-data:7:4:9:2025-10", "[]");
    sessionStorage.setItem("something-else", "keep");
    clearEntryDrafts();
    expect(sessionStorage.getItem("add-data:7:4:9:2025-09")).toBeNull();
    expect(sessionStorage.getItem("add-data:7:4:9:2025-10")).toBeNull();
    expect(sessionStorage.getItem("something-else")).toBe("keep");
  });
});

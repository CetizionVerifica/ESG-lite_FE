import { describe, expect, it } from "vitest";
import { enteredByText, isDuplicateAnswer, replaceBlocked, replaceWhereAllowed, savedEntryOf, type SavedMatch } from "./duplicate";

const saved = (over: Partial<SavedMatch> = {}): SavedMatch => ({ tco2e: 2.57, status: "pending", enteredBy: "Shyam Sharma", enteredByYou: false, canReplace: false, ...over });

describe("the duplicate answer", () => {
  it("is a 409 duplicate or a refused Replace", () => {
    expect(isDuplicateAnswer(409, { duplicate: true })).toBe(true);
    expect(isDuplicateAnswer(403, { code: "REPLACE_NOT_ALLOWED" })).toBe(true);
    expect(isDuplicateAnswer(409, { mode_lock: true } as never)).toBe(false);
    expect(isDuplicateAnswer(403, { code: "SITE_NOT_ALLOWED" })).toBe(false);
  });

  it("reads who entered the saved entry and whether Replace is allowed", () => {
    expect(
      savedEntryOf({ existing_emission: { total_emission: "2.57", status: "pending" }, entered_by: { name: "Shyam Sharma", you: false }, can_replace: false }),
    ).toEqual(saved());
    expect(savedEntryOf({ existing_emission: { total_emission: 1, status: "approved" }, entered_by: { name: "Asha", you: true }, can_replace: false })).toEqual(
      saved({ tco2e: 1, status: "approved", enteredBy: "Asha", enteredByYou: true }),
    );
  });

  it("an older server that doesn't say leaves Replace on", () => {
    expect(savedEntryOf({ existing_emission: { total_emission: 3, status: "pending" } })).toEqual({
      tco2e: 3, status: "pending", enteredBy: null, enteredByYou: false, canReplace: true,
    });
    expect(savedEntryOf({})).toBeNull();
  });
});

describe("Replace in the dialog", () => {
  it("says why it's off", () => {
    expect(replaceBlocked(saved())).toBe("Shyam Sharma entered this, so you can't replace it.");
    expect(replaceBlocked(saved({ enteredBy: null }))).toBe("Someone else entered this, so you can't replace it.");
    expect(replaceBlocked(saved({ enteredByYou: true, status: "approved" }))).toBe("It's already approved, so you can't replace it.");
    expect(replaceBlocked(saved({ canReplace: true }))).toBeNull();
    expect(replaceBlocked(null)).toBeNull();
  });

  it("names who entered it", () => {
    expect(enteredByText(saved())).toBe("entered by Shyam Sharma");
    expect(enteredByText(saved({ enteredByYou: true }))).toBe("entered by you");
    expect(enteredByText(saved({ enteredBy: null }))).toBe("");
  });

  it("Replace all skips the rows that can't be replaced", () => {
    const items = [
      { id: 1, existing: saved({ canReplace: true, enteredByYou: true }) },
      { id: 2, existing: saved() },
      { id: 3, existing: null },
    ];
    expect(replaceWhereAllowed(items, { 1: "skip", 2: "keep", 3: "skip" })).toEqual({ 1: "replace", 2: "keep", 3: "replace" });
  });
});

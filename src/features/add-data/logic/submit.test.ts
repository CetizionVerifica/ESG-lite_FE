import { describe, expect, it } from "vitest";
import { draftIdsToSubmit, finishCopy, mergeSubmit } from "./submit";

const none = { submitted: [], refused: [], failed: false };

describe("Save and submit (S3-15, review workflow on)", () => {
  it("submits only rows the server saved as drafts", () => {
    expect(
      draftIdsToSubmit([
        { kind: "saved", emissionId: 1, status: "draft" },
        { kind: "saved", emissionId: 2, status: "pending" },
        { kind: "saved", emissionId: 3 },
        { kind: "saved", emissionId: null, status: "draft" },
        { kind: "error", message: "x", modeLock: false },
      ]),
    ).toEqual([1]);
  });

  it("adds up submits across sends", () => {
    expect(mergeSubmit(none, { submitted: [1], refused: [{ id: 2, code: "NOT_DRAFT" }] })).toEqual({ submitted: [1], refused: [{ id: 2, code: "NOT_DRAFT" }], failed: false });
  });

  it("says what was sent and what stayed a draft", () => {
    expect(finishCopy(["draft", "draft"], { ...none, submitted: [1, 2] }, "Sep 2026")).toEqual({ title: "2 rows sent for approval", description: "Your manager reviews Sep 2026 next." });
    expect(finishCopy(["draft", "draft"], none, "Sep 2026")).toEqual({ title: "2 rows saved as drafts", description: "Submit them from My month when they're ready." });
    expect(finishCopy(["draft"], { ...none, failed: true }, "Sep 2026").description).toMatch(/couldn't be submitted/);
    expect(finishCopy(["draft", "draft"], { ...none, submitted: [1] }, "Sep 2026")).toEqual({
      title: "1 row sent for approval",
      description: "Your manager reviews Sep 2026 next. 1 row stayed as drafts; submit them from My month.",
    });
    // A Manager's rows are saved pending: sent without a submit.
    expect(finishCopy(["pending"], none, "Sep 2026").title).toBe("1 row sent for approval");
  });

});

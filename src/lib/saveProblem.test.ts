import { describe, expect, it } from "vitest";
import { saveProblem } from "./saveProblem";

const refused = (data: Record<string, unknown>) => ({ response: { status: 409, data } });

describe("saveProblem", () => {
  it("someone else changed the entry: a warning that ends the edit", () => {
    const p = saveProblem(refused({ code: "ENTRY_CHANGED", severity: "warning", message: "Changed by someone else." }), "x");
    expect(p).toEqual({ message: "Changed by someone else.", warning: true, stopEdit: true, duplicate: false });
  });

  it("approved meanwhile: a warning that ends the edit too", () => {
    const p = saveProblem({ response: { status: 403, data: { code: "ENTRY_APPROVED", severity: "warning", message: "Approved." } } }, "x");
    expect(p).toEqual({ message: "Approved.", warning: true, stopEdit: true, duplicate: false });
  });

  it("a duplicate: a warning the person can keep both on, or pick another date", () => {
    expect(saveProblem(refused({ duplicate: true, severity: "warning", message: "Already exists." }), "x")).toEqual({
      message: "Already exists.",
      warning: true,
      stopEdit: false,
      duplicate: true,
    });
  });

  it("a mode-lock refusal: a warning with no keep both", () => {
    expect(saveProblem(refused({ conflict: "yearly", severity: "warning", message: "Filed yearly." }), "x")).toEqual({
      message: "Filed yearly.",
      warning: true,
      stopEdit: false,
      duplicate: false,
    });
  });

  it("anything else stays an error, with the fallback when the server sends no message", () => {
    expect(saveProblem(refused({ message: "No emission factor found" }), "x")).toEqual({
      message: "No emission factor found",
      warning: false,
      stopEdit: false,
      duplicate: false,
    });
    expect(saveProblem(new Error("network"), "Couldn't save.")).toEqual({ message: "Couldn't save.", warning: false, stopEdit: false, duplicate: false });
  });
});

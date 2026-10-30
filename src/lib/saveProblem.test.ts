import { describe, expect, it } from "vitest";
import { saveProblem } from "./saveProblem";

const refused = (data: Record<string, unknown>) => ({ response: { status: 409, data } });

describe("saveProblem", () => {
  it("someone else changed the entry: a warning that ends the edit", () => {
    const p = saveProblem(refused({ code: "ENTRY_CHANGED", severity: "warning", message: "Changed by someone else." }), "x");
    expect(p).toEqual({ message: "Changed by someone else.", warning: true, stopEdit: true });
  });

  it("approved meanwhile: a warning that ends the edit too", () => {
    const p = saveProblem({ response: { status: 403, data: { code: "ENTRY_APPROVED", severity: "warning", message: "Approved." } } }, "x");
    expect(p).toEqual({ message: "Approved.", warning: true, stopEdit: true });
  });

  it("a duplicate or mode-lock refusal: a warning, the person can still pick another date", () => {
    expect(saveProblem(refused({ duplicate: true, severity: "warning", message: "Already exists." }), "x")).toEqual({
      message: "Already exists.",
      warning: true,
      stopEdit: false,
    });
  });

  it("anything else stays an error, with the fallback when the server sends no message", () => {
    expect(saveProblem(refused({ message: "No emission factor found" }), "x")).toEqual({ message: "No emission factor found", warning: false, stopEdit: false });
    expect(saveProblem(new Error("network"), "Couldn't save.")).toEqual({ message: "Couldn't save.", warning: false, stopEdit: false });
  });
});

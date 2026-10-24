import { describe, expect, it } from "vitest";
import snapshot from "./contracts.snapshot.json";
import * as c from "./contracts";
import ghgDoc from "../../test/fixtures/studio/ghg-doc.json";
import sustainabilityDoc from "../../test/fixtures/studio/sustainability-doc.json";

/**
 * DS-0: the mirror carries exactly the backend's contract names.
 * `contracts.snapshot.json` is a copy of ESG-lite `ci/studio-contracts.json`
 * (the backend's unit test keeps that file current); a contract change
 * updates both in the same DS-0 follow-up.
 */
describe("studio contracts mirror", () => {
  it("has every backend enum, with the same values in the same order", () => {
    const fe = c as unknown as Record<string, unknown>;
    for (const [name, values] of Object.entries(snapshot.enums)) {
      expect(fe[name], name).toEqual(values);
    }
  });

  it("has every backend error code with its status, and no others", () => {
    expect(c.DS_ERROR_STATUS).toEqual(snapshot.errors);
  });

  it("has every check with its default severity and kinds", () => {
    expect(c.CHECK_RULES).toEqual(snapshot.checks);
  });

  it("puts each report input in the same kinds", () => {
    expect(c.REPORT_INPUT_KINDS).toEqual(snapshot.reportInputKinds);
    expect(c.inputKeysFor("sustainability")).toEqual(["reporting_period", "verification", "leadership_message", "about_company"]);
  });

  it("types the fixture docs (the backend schema accepts them: ci/unit/ds-0-contracts)", () => {
    const docs = [ghgDoc, sustainabilityDoc] as unknown as c.ReportDoc[];
    expect(docs.map((d) => [d.kind, d.schemaVersion, d.format])).toEqual([
      ["ghg", 2, "a4"],
      ["sustainability", 2, "a4"],
    ]);
  });

  it("knows who edits and who finalises", () => {
    expect(c.canEditStudio("Admin")).toBe(true);
    expect(c.canEditStudio("User")).toBe(false);
    expect(c.canFinaliseStudio("Admin")).toBe(false);
    expect(c.canFinaliseStudio("Manager")).toBe(true);
    expect(c.isDsErrorCode("DS_STUDIO_OFF")).toBe(true);
    expect(c.isDsErrorCode("KPI_TRACKING_OFF")).toBe(false);
  });
});
